import type {
  NsgCell,
  NsgEvent,
  NsgLocation,
  NsgLog,
  NsgParseMode,
  NsgParseOptions,
  NsgProgress,
  NsgSignalingRecord,
  NsgSource,
  NsgTimestamp,
} from "../model";
import { EventProcessor, type EventProcessorSink } from "./eventProcessor";
import { associateQualcommNsaMeasurements, mergeAssociatedNsaCells } from "./nsa/association";
import type { DefaultDataSubscriptionChange, LteAnchor, TimedLteServingCellInfo, TimedNrMeasurement } from "./nsa/model";
import type { QualcommDiagPrefix } from "./qualcomm/diag";
import type { DecodedQualcommRecord, QualcommRecordPolicy } from "./qualcomm/record";
import { decodeQualcommRecord } from "./qualcomm/record";
import { isValidQualcommSignalingEnvelope } from "./qualcomm/signaling/decoder";
import { fuseQualcommSaCells } from "./sa/association";
import type { TimedNrConfigurationInfo, TimedNrServingCellInfo } from "./sa/model";

export const MAX_RETAINED_SIGNALING_RECORDS = 10_000;
const MAX_RETAINED_SIGNALING_PAYLOAD_BYTES = 16 * 1024 * 1024;

export type RecordContext = Readonly<{
  recordOffset: number;
  streamIndex: number;
  elapsedUs: number;
}>;

export type QualcommPayloadCapture = Readonly<{
  byteLength: number;
  validationPrefix: QualcommDiagPrefix | null;
}>;

type Fail = (message: string) => never;

export type RecordingOptions = Pick<NsgParseOptions, "mode" | "allowIncompleteFinalRecord" | "onCell" | "onEvent">;

export class RecordingBuilder {
  private headerXml = "";
  private epochUs: bigint | null = null;
  private maximumElapsedUs = 0;
  private previousElapsedUs: number | null = null;
  private recordCount = 0;
  private eventCount = 0;
  private cellCount = 0;
  private timeRegressions = 0;
  private recognizedPayloadBytes = 0;
  private servingCellCount = 0;
  private signalingRecordCount = 0;
  private signalingPayloadBytes = 0;
  private signalingTruncated = false;
  private inputTruncated = false;
  private finished = false;
  private result: NsgLog | null = null;
  private readonly recordTypeCounts = new Map<number, number>();
  private readonly eventTypeCounts = new Map<string, number>();
  private readonly events: NsgEvent[] = [];
  private readonly cells: NsgCell[] = [];
  private readonly signaling: NsgSignalingRecord[] = [];
  private readonly locations: NsgLocation[] = [];
  private readonly lteAnchors: LteAnchor[] = [];
  private readonly lteServingCellInfos: TimedLteServingCellInfo[] = [];
  private readonly defaultDataSubscriptions: DefaultDataSubscriptionChange[] = [];
  private readonly nrMeasurements: TimedNrMeasurement[] = [];
  private readonly nrConfigurations: TimedNrConfigurationInfo[] = [];
  private readonly nrServingCellInfos: TimedNrServingCellInfo[] = [];
  private readonly eventProcessor: EventProcessor;
  private readonly eventSink: EventProcessorSink;
  private readonly mode: NsgParseMode;

  constructor(
    private readonly source: NsgSource,
    private readonly options: RecordingOptions,
    decoder: TextDecoder,
    private readonly fail: Fail,
  ) {
    this.mode = options.mode ?? "complete";
    this.eventProcessor = new EventProcessor(decoder, fail);
    this.eventSink = {
      emitCell: (cell) => this.emitCell(cell),
      retainDefaultDataSubscription: (change) => this.defaultDataSubscriptions.push(change),
      retainLteAnchor: (anchor) => this.lteAnchors.push(anchor),
      retainLocation: (location) => this.locations.push(location),
    };
  }

  get isFinished(): boolean {
    return this.finished;
  }

  setHeaderXml(headerXml: string): void {
    this.headerXml = headerXml;
  }

  observeRecord(elapsedUs: number, recordType: number): void {
    this.recordCount++;
    this.recordTypeCounts.set(recordType, (this.recordTypeCounts.get(recordType) ?? 0) + 1);
    this.maximumElapsedUs = Math.max(this.maximumElapsedUs, elapsedUs);
    if (this.previousElapsedUs !== null && elapsedUs < this.previousElapsedUs) this.timeRegressions++;
    this.previousElapsedUs = elapsedUs;
  }

  markInputTruncated(): void {
    this.inputTruncated = true;
  }

  validateTimeAnchor(elapsedUs: number, payloadLength: number): void {
    if (this.epochUs !== null || elapsedUs !== 0 || payloadLength !== 8) this.fail("Unsupported NSG time anchor");
  }

  setTimeAnchor(payload: Uint8Array): void {
    this.epochUs = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getBigUint64(0, true);
    if (!Number.isFinite(new Date(Number(this.epochUs / 1000n)).getTime())) this.fail("NSG time anchor is outside the supported date range");
  }

  selectQualcommPayloadCapture(policy: QualcommRecordPolicy | null, prefix: QualcommDiagPrefix): QualcommPayloadCapture | null {
    if (this.mode === "streaming" || policy === null) return null;
    if (
      policy.kind === "signaling" &&
      (this.signalingTruncated ||
        this.signaling.length >= MAX_RETAINED_SIGNALING_RECORDS ||
        this.signalingPayloadBytes + prefix.packetLength > MAX_RETAINED_SIGNALING_PAYLOAD_BYTES)
    )
      return {
        byteLength: Math.min(prefix.packetLength, policy.validationPrefixBytes),
        validationPrefix: prefix,
      };
    return { byteLength: prefix.packetLength, validationPrefix: null };
  }

  recordQualcommPayload(payload: Uint8Array, context: RecordContext, validationPrefix: QualcommDiagPrefix | null): void {
    if (validationPrefix !== null) {
      this.countTruncatedSignaling(payload, validationPrefix);
      return;
    }
    const record = decodeQualcommRecord(payload);
    if (record === null) return;
    switch (record.kind) {
      case "nrMeasurement":
        this.decodeNrMeasurement(record, context);
        break;
      case "nrConfiguration":
        this.decodeNrConfiguration(record, context);
        break;
      case "nrServingCell":
        this.decodeNrServingCell(record, context);
        break;
      case "lteServingCell":
        this.decodeLteServingCell(record, context);
        break;
      case "signaling":
        this.decodeSignaling(record, context);
        break;
    }
  }

  recordEvent(payload: Uint8Array, marker: number, context: RecordContext): void {
    const data = this.eventProcessor.parsePayload(payload);
    const event: NsgEvent = {
      id: this.eventCount++,
      name: typeof data.event === "string" ? data.event : "<missing>",
      marker,
      recordOffset: context.recordOffset,
      streamIndex: context.streamIndex,
      ...this.timestamp(context.elapsedUs),
      data,
    };
    if (this.mode === "complete") this.events.push(event);
    this.recognizedPayloadBytes += payload.length;
    this.eventTypeCounts.set(event.name, (this.eventTypeCounts.get(event.name) ?? 0) + 1);
    this.eventProcessor.processEvent(event, this.mode, this.eventSink);
    this.options.onEvent?.(event);
  }

  progress(offset: number): NsgProgress {
    const pendingLimit = Math.min(Math.max(0, this.source.size - 1), Math.floor(this.source.size * 0.99));
    const bytesRead = this.finished ? this.source.size : Math.min(this.source.inputBytesRead?.() ?? offset, pendingLimit);
    return {
      bytesRead,
      totalBytes: this.source.size,
      percent: this.source.size === 0 ? 0 : (bytesRead / this.source.size) * 100,
      recordCount: this.recordCount,
      eventCount: this.eventCount,
      cellCount: this.cellCount,
    };
  }

  finish(): NsgLog {
    if (this.result !== null) return this.result;
    if (this.epochUs === null) this.fail("No supported NSG time anchor found");
    this.emitAssociatedNrCells();
    const end = this.timestamp(this.maximumElapsedUs);
    this.finished = true;
    this.result = {
      sourceName: this.source.name,
      sourceBytes: this.source.size,
      headerXml: this.headerXml,
      startTimestampUs: this.epochUs.toString(),
      startTimestampMs: Number(this.epochUs / 1000n),
      endTimestampMs: end.timestampMs,
      durationSeconds: this.maximumElapsedUs / 1_000_000,
      recordCount: this.recordCount,
      recordTypeCounts: Object.fromEntries(this.recordTypeCounts),
      eventTypeCounts: Object.fromEntries(this.eventTypeCounts),
      timeRegressions: this.timeRegressions,
      recognizedPayloadBytes: this.recognizedPayloadBytes,
      servingCellCount: this.servingCellCount,
      signalingRecordCount: this.signalingRecordCount,
      signalingTruncated: this.signalingTruncated,
      inputTruncated: this.inputTruncated,
      events: this.events,
      cells: this.cells,
      signaling: this.signaling,
      locations: this.locations,
    };
    this.emitRetainedCellCallbacks();
    return this.result;
  }

  private countTruncatedSignaling(payloadPrefix: Uint8Array, prefix: QualcommDiagPrefix): void {
    if (!isValidQualcommSignalingEnvelope(payloadPrefix, prefix)) return;
    this.signalingRecordCount++;
    this.recognizedPayloadBytes += prefix.packetLength;
    this.signalingTruncated = true;
  }

  private decodeNrMeasurement(record: Extract<DecodedQualcommRecord, { kind: "nrMeasurement" }>, context: RecordContext): void {
    if (this.mode === "streaming") return;
    const measurement = record.value;
    this.recognizedPayloadBytes += measurement.packetLength;
    this.nrMeasurements.push({
      recordOffset: context.recordOffset,
      streamIndex: context.streamIndex,
      measurement,
      ...this.timestamp(context.elapsedUs),
    });
  }

  private decodeNrConfiguration(record: Extract<DecodedQualcommRecord, { kind: "nrConfiguration" }>, context: RecordContext): void {
    if (this.mode === "streaming") return;
    this.recognizedPayloadBytes += record.packetLength;
    this.nrConfigurations.push({
      recordOffset: context.recordOffset,
      streamIndex: context.streamIndex,
      configuration: record.value,
      ...this.timestamp(context.elapsedUs),
    });
  }

  private decodeNrServingCell(record: Extract<DecodedQualcommRecord, { kind: "nrServingCell" }>, context: RecordContext): void {
    if (this.mode === "streaming") return;
    this.recognizedPayloadBytes += record.packetLength;
    this.nrServingCellInfos.push({
      recordOffset: context.recordOffset,
      streamIndex: context.streamIndex,
      info: record.value,
      ...this.timestamp(context.elapsedUs),
    });
  }

  private decodeLteServingCell(record: Extract<DecodedQualcommRecord, { kind: "lteServingCell" }>, context: RecordContext): void {
    if (this.mode === "streaming") return;
    const info = record.value;
    this.recognizedPayloadBytes += record.packetLength;
    this.lteServingCellInfos.push({
      streamIndex: context.streamIndex,
      elapsedUs: context.elapsedUs,
      cellIdentity: info.cellIdentity,
      earfcn: info.earfcn,
      pci: info.pci,
      mcc: info.mcc,
      mnc: info.mnc,
    });
  }

  private decodeSignaling(record: Extract<DecodedQualcommRecord, { kind: "signaling" }>, context: RecordContext): void {
    if (this.mode === "streaming") return;
    const decoded = record.value;
    const id = this.signalingRecordCount++;
    this.recognizedPayloadBytes += decoded.packetLength;
    this.signalingPayloadBytes += decoded.packetLength;
    this.signaling.push({
      id,
      recordOffset: context.recordOffset,
      streamIndex: context.streamIndex,
      ...this.timestamp(context.elapsedUs),
      ...decoded,
    });
  }

  private timestamp(elapsedUs: number): NsgTimestamp {
    if (this.epochUs === null) this.fail("Decoded NSG event precedes the time anchor");
    const timestampUs = this.epochUs + BigInt(elapsedUs);
    const timestampMs = Number(timestampUs / 1000n);
    if (!Number.isFinite(new Date(timestampMs).getTime())) this.fail("NSG event timestamp is outside the supported date range");
    return { elapsedUs, timestampUs: timestampUs.toString(), timestampMs };
  }

  private emitCell(cell: NsgCell): void {
    this.cellCount++;
    if (this.mode === "complete") this.cells.push(cell);
    if (cell.registered === true) this.servingCellCount++;
    if (this.mode === "streaming") this.options.onCell?.(cell);
  }

  private emitRetainedCellCallbacks(): void {
    const { onCell } = this.options;
    if (this.mode === "streaming" || onCell === undefined) return;
    for (const cell of this.cells) onCell(cell);
  }

  private emitAssociatedNrCells(): void {
    if (this.mode === "streaming") return;
    const sa = fuseQualcommSaCells(
      this.cells,
      this.events,
      this.nrConfigurations,
      this.nrServingCellInfos,
      this.nrMeasurements,
      this.lteAnchors,
      this.lteServingCellInfos,
      this.defaultDataSubscriptions,
    );
    for (const event of sa.syntheticEvents) {
      this.events.push(event);
      this.eventCount++;
      this.eventTypeCounts.set(event.name, (this.eventTypeCounts.get(event.name) ?? 0) + 1);
      this.options.onEvent?.(event);
    }
    const associations = associateQualcommNsaMeasurements(
      this.lteAnchors,
      sa.remainingMeasurements.filter((observation) => observation.measurement.cells.some((cell) => cell.serving)),
      this.lteServingCellInfos,
      this.defaultDataSubscriptions,
    );
    for (const { anchor } of associations) {
      anchor.measurementRole = "lte-secondary";
      anchor.raw.measurementRole = "lte-secondary";
    }
    const mergedCells = mergeAssociatedNsaCells(sa.cells, associations);
    this.cells.length = 0;
    for (const cell of mergedCells) this.cells.push(cell);
    this.cellCount = this.cells.length;
    this.servingCellCount = this.cells.reduce((count, cell) => count + (cell.registered === true ? 1 : 0), 0);
    this.lteAnchors.length = 0;
    this.lteServingCellInfos.length = 0;
    this.defaultDataSubscriptions.length = 0;
    this.nrMeasurements.length = 0;
    this.nrConfigurations.length = 0;
    this.nrServingCellInfos.length = 0;
  }
}
