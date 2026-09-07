import { NSG_MAGIC } from "./fileStream";
import { isValidLatLng } from "./geometry";
import { type LteAnchor, type TimedNrMeasurement, associateQualcommNsaMeasurements, mergeAssociatedNsaCells } from "./nsaAssociation";
import { NsgStreamingOperatorResolver } from "./operator";
import { type QualcommDiagHeader, type QualcommDiagPrefix, readDiagHeader, readDiagPrefix } from "./qualcommDiag";
import { MAX_QUALCOMM_NR_MEASUREMENT_BYTES, QUALCOMM_NR_MEASUREMENT_LOG_CODE, decodeQualcommNrMeasurement } from "./qualcommNr";
import {
  MAX_QUALCOMM_SIGNALING_BYTES,
  QUALCOMM_SIGNALING_ENVELOPE_BYTES,
  decodeQualcommSignaling,
  isQualcommSignalingLogCode,
  isValidQualcommSignalingEnvelope,
} from "./qualcommSignaling";
import type { NsgCell, NsgEvent, NsgJsonObject, NsgLocation, NsgLog, NsgProgress, NsgSignalingRecord, NsgTimestamp } from "./types";

const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const QUALCOMM_PREFIX_BYTES = 4;
export const MAX_RETAINED_NSG_SIGNALING_RECORDS = 10_000;
const MAX_RETAINED_NSG_SIGNALING_PAYLOAD_BYTES = 16 * 1024 * 1024;
export type NsgSource = Readonly<{
  name: string;
  size: number;
  decodedSize?: number | null;
  inputBytesRead?: () => number;
}>;
type Phase = "magic" | "xmlLength" | "xml" | "header" | "prefix" | "qualcommPrefix" | "payload";
export type NsgParseOptions = { retainHistory?: boolean; onCell?: (cell: NsgCell) => void; onEvent?: (event: NsgEvent) => void };

type NsgRadioFields = Pick<
  NsgCell,
  "lac" | "cid" | "tac" | "eci" | "pci" | "earfcn" | "arfcn" | "uarfcn" | "psc" | "bsic" | "dbm" | "rssi" | "rsrp" | "rsrq" | "sinr" | "ta" | "ber"
>;

function isObject(value: unknown): value is NsgJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function radioFields(raw: NsgJsonObject): NsgRadioFields {
  return {
    lac: numeric(raw.lac),
    cid: numeric(raw.cid),
    tac: numeric(raw.tac),
    eci: numeric(raw.eci),
    pci: numeric(raw.pci),
    earfcn: numeric(raw.earfcn),
    arfcn: numeric(raw.arfcn),
    uarfcn: numeric(raw.uarfcn),
    psc: numeric(raw.psc),
    bsic: numeric(raw.bsic),
    dbm: numeric(raw.dbm),
    rssi: numeric(raw.rssi),
    rsrp: numeric(raw.rsrp),
    rsrq: numeric(raw.rsrq),
    sinr: numeric(raw.sinr),
    ta: numeric(raw.ta),
    ber: numeric(raw.ber),
  };
}

export function formatNsgTimestamp(timestampUs: string): string {
  const epochUs = BigInt(timestampUs);
  const date = new Date(Number(epochUs / 1000n));
  return `${date.toISOString().slice(0, 19)}.${(epochUs % 1_000_000n).toString().padStart(6, "0")}Z`;
}

export class NsgStreamParser {
  private phase: Phase = "magic";
  private offset = 0;
  private varintValue = 0;
  private varintFactor = 1;
  private varintBytes = 0;
  private frame: number[] = [];
  private frameOffset = 0;
  private remaining = 0;
  private payload: Uint8Array | null = null;
  private payloadPosition = 0;
  private readonly qualcommPrefix = new Uint8Array(QUALCOMM_PREFIX_BYTES);
  private qualcommPrefixPosition = 0;
  private signalingValidationPrefix: QualcommDiagPrefix | null = null;
  private marker: number | null = null;
  private headerXml = "";
  private epochUs: bigint | null = null;
  private maximumElapsedUs = 0;
  private previousElapsedUs: number | null = null;
  private recordCount = 0;
  private eventCount = 0;
  private cellCount = 0;
  private timeRegressions = 0;
  private decodedBytes = 0;
  private servingCellCount = 0;
  private signalingRecordCount = 0;
  private signalingPayloadBytes = 0;
  private signalingTruncated = false;
  private finished = false;
  private result: NsgLog | null = null;
  private readonly recordTypeCounts = new Map<number, number>();
  private readonly eventTypeCounts = new Map<string, number>();
  private readonly events: NsgEvent[] = [];
  private readonly cells: NsgCell[] = [];
  private readonly signaling: NsgSignalingRecord[] = [];
  private readonly locations: NsgLocation[] = [];
  private readonly lteAnchors: LteAnchor[] = [];
  private readonly nrMeasurements: TimedNrMeasurement[] = [];
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly operators = new NsgStreamingOperatorResolver();
  private readonly expectedDecodedSize: number | null;
  private readonly retainHistory: boolean;

  constructor(
    private readonly source: NsgSource,
    private readonly options: NsgParseOptions = {},
  ) {
    if (!Number.isSafeInteger(source.size) || source.size < 0) throw new Error("Invalid NSG file size.");
    this.retainHistory = options.retainHistory !== false;
    this.expectedDecodedSize = source.decodedSize === undefined ? source.size : source.decodedSize;
    if (this.expectedDecodedSize !== null && (!Number.isSafeInteger(this.expectedDecodedSize) || this.expectedDecodedSize < 0))
      throw new Error("Invalid decoded NSG file size.");
  }

  private fail(message: string): never {
    throw new Error(`${message} (byte ${this.offset}).`);
  }

  push(chunk: Uint8Array): void {
    if (this.finished) this.fail("Cannot append to a finished NSG log");
    if (this.expectedDecodedSize !== null && chunk.length > this.expectedDecodedSize - this.offset)
      this.fail("NSG stream exceeds the declared file size");
    let position = 0;
    while (position < chunk.length) {
      if (this.phase === "magic") {
        if (chunk[position++] !== NSG_MAGIC[this.offset++]) this.fail("Expected an NSG !NSG log; CLF, DLF and QMDL are not supported here");
        if (this.offset === NSG_MAGIC.length) this.phase = "xmlLength";
        continue;
      }

      if (this.phase === "xmlLength" || this.phase === "header") {
        const byte = chunk[position++];
        this.offset++;
        this.varintBytes++;
        this.varintValue += (byte & 0x7f) * this.varintFactor;
        if (!Number.isSafeInteger(this.varintValue) || this.varintBytes > 10) this.fail("Unsupported NSG integer larger than the safe integer range");
        if (byte >= 0x80) {
          if (this.varintBytes === 10) this.fail("Unterminated NSG ULEB128 integer");
          this.varintFactor *= 128;
          continue;
        }
        const value = this.varintValue;
        this.varintValue = 0;
        this.varintFactor = 1;
        this.varintBytes = 0;
        if (this.phase === "xmlLength") {
          if (value === 0 || value > MAX_HEADER_BYTES || (this.expectedDecodedSize !== null && value > this.expectedDecodedSize - this.offset))
            this.fail("Invalid or unsupported NSG XML header length");
          this.payload = new Uint8Array(value);
          this.payloadPosition = 0;
          this.remaining = value;
          this.phase = "xml";
        } else {
          this.frame.push(value);
          if (this.frame.length === 6) this.beginPayload();
        }
        continue;
      }

      if (this.phase === "prefix") {
        this.marker = chunk[position++];
        this.offset++;
        this.remaining--;
        if (this.marker >= 0x40 && this.marker <= 0x44) {
          if (this.remaining > MAX_JSON_BYTES) this.fail("A decoded NSG event exceeds the 16 MiB limit");
          this.payload = new Uint8Array(this.remaining);
          this.payloadPosition = 0;
        }
        this.phase = "payload";
        if (this.remaining === 0) this.completePayload();
        continue;
      }

      if (this.phase === "qualcommPrefix") {
        const length = Math.min(this.remaining, QUALCOMM_PREFIX_BYTES - this.qualcommPrefixPosition, chunk.length - position);
        this.qualcommPrefix.set(chunk.subarray(position, position + length), this.qualcommPrefixPosition);
        this.qualcommPrefixPosition += length;
        position += length;
        this.offset += length;
        this.remaining -= length;
        if (this.qualcommPrefixPosition < QUALCOMM_PREFIX_BYTES) continue;

        const payloadLength = this.remaining + QUALCOMM_PREFIX_BYTES;
        const prefix = readDiagPrefix(this.qualcommPrefix);
        if (prefix === null) this.fail("Invalid Qualcomm DIAG prefix");
        const { logCode, packetLength } = prefix;
        const isSignaling = isQualcommSignalingLogCode(logCode);
        const supportedLength =
          packetLength >= 12 &&
          packetLength <= payloadLength &&
          ((logCode === QUALCOMM_NR_MEASUREMENT_LOG_CODE && packetLength <= MAX_QUALCOMM_NR_MEASUREMENT_BYTES) ||
            (isSignaling && packetLength <= MAX_QUALCOMM_SIGNALING_BYTES));
        if (this.retainHistory && supportedLength) {
          const signalingAtCapacity =
            isSignaling &&
            (this.signalingTruncated ||
              this.signaling.length >= MAX_RETAINED_NSG_SIGNALING_RECORDS ||
              this.signalingPayloadBytes + packetLength > MAX_RETAINED_NSG_SIGNALING_PAYLOAD_BYTES);
          if (signalingAtCapacity) {
            this.payload = new Uint8Array(Math.min(packetLength, QUALCOMM_SIGNALING_ENVELOPE_BYTES));
            this.payload.set(this.qualcommPrefix);
            this.payloadPosition = QUALCOMM_PREFIX_BYTES;
            this.signalingValidationPrefix = prefix;
          } else {
            this.payload = new Uint8Array(packetLength);
            this.payload.set(this.qualcommPrefix);
            this.payloadPosition = QUALCOMM_PREFIX_BYTES;
          }
        }
        this.phase = "payload";
        if (this.remaining === 0) this.completePayload();
        continue;
      }

      const length = Math.min(this.remaining, chunk.length - position);
      if (this.payload !== null) {
        const retainedLength = Math.min(length, this.payload.length - this.payloadPosition);
        if (retainedLength > 0) {
          this.payload.set(chunk.subarray(position, position + retainedLength), this.payloadPosition);
          this.payloadPosition += retainedLength;
        }
      }
      position += length;
      this.offset += length;
      this.remaining -= length;
      if (this.remaining > 0) continue;
      if (this.phase === "xml") {
        try {
          this.headerXml = this.decoder.decode(this.payload!);
        } catch {
          this.fail("Invalid UTF-8 in the NSG XML header");
        }
        this.payload = null;
        this.phase = "header";
        this.frameOffset = this.offset;
      } else this.completePayload();
    }
  }

  private beginPayload(): void {
    const [, , elapsedUs, recordType, , length] = this.frame;
    if (this.expectedDecodedSize !== null && length > this.expectedDecodedSize - this.offset) this.fail("Truncated NSG record payload");
    this.recordCount++;
    this.recordTypeCounts.set(recordType, (this.recordTypeCounts.get(recordType) ?? 0) + 1);
    this.maximumElapsedUs = Math.max(this.maximumElapsedUs, elapsedUs);
    if (this.previousElapsedUs !== null && elapsedUs < this.previousElapsedUs) this.timeRegressions++;
    this.previousElapsedUs = elapsedUs;
    this.remaining = length;
    this.payload = null;
    this.payloadPosition = 0;
    this.signalingValidationPrefix = null;
    this.marker = null;
    this.phase = "payload";
    if (recordType === 0) {
      if (this.epochUs !== null || elapsedUs !== 0 || length !== 8) this.fail("Unsupported NSG time anchor");
      this.payload = new Uint8Array(8);
    } else if (recordType === 53 && length > 0) this.phase = "prefix";
    else if (recordType === 16 && length >= QUALCOMM_PREFIX_BYTES) {
      this.qualcommPrefixPosition = 0;
      this.phase = "qualcommPrefix";
    }
    if (length === 0) this.completePayload();
  }

  private completePayload(): void {
    if (this.frame[3] === 0) {
      this.epochUs = new DataView(this.payload!.buffer).getBigUint64(0, true);
      if (!Number.isFinite(new Date(Number(this.epochUs / 1000n)).getTime())) this.fail("NSG time anchor is outside the supported date range");
    } else if (this.frame[3] === 16 && this.payload !== null) {
      if (this.signalingValidationPrefix !== null) this.countTruncatedSignaling(this.payload, this.signalingValidationPrefix);
      else this.decodeQualcommPayload(this.payload);
    } else if (this.payload !== null && this.marker !== null) this.decodeEvent(this.payload, this.marker);
    this.payload = null;
    this.frame.length = 0;
    this.phase = "header";
    this.frameOffset = this.offset;
  }

  private decodeQualcommPayload(payload: Uint8Array): void {
    const prefix = readDiagPrefix(payload);
    if (prefix === null) return;
    if (prefix.logCode === QUALCOMM_NR_MEASUREMENT_LOG_CODE) {
      const header = readDiagHeader(payload, MAX_QUALCOMM_NR_MEASUREMENT_BYTES, prefix);
      if (header !== null) this.decodeNrMeasurement(payload, header);
    } else if (isQualcommSignalingLogCode(prefix.logCode)) {
      const header = readDiagHeader(payload, MAX_QUALCOMM_SIGNALING_BYTES, prefix);
      if (header !== null) this.decodeSignaling(payload, header);
    }
  }

  private countTruncatedSignaling(payloadPrefix: Uint8Array, prefix: QualcommDiagPrefix): void {
    if (!isValidQualcommSignalingEnvelope(payloadPrefix, prefix)) return;
    this.signalingRecordCount++;
    this.decodedBytes += prefix.packetLength;
    this.signalingTruncated = true;
  }

  private decodeNrMeasurement(payload: Uint8Array, header: QualcommDiagHeader): void {
    if (!this.retainHistory) return;
    const measurement = decodeQualcommNrMeasurement(payload, header);
    if (measurement === null || !measurement.cells.some((cell) => cell.serving)) return;
    this.decodedBytes += measurement.packetLength;
    this.nrMeasurements.push({ recordOffset: this.frameOffset, measurement, ...this.timestamp(this.frame[2]) });
  }

  private decodeSignaling(payload: Uint8Array, header: QualcommDiagHeader): void {
    if (!this.retainHistory) return;
    const decoded = decodeQualcommSignaling(payload, header);
    if (decoded === null) return;
    const id = this.signalingRecordCount++;
    this.decodedBytes += decoded.packetLength;
    this.signalingPayloadBytes += decoded.packetLength;
    this.signaling.push({ id, recordOffset: this.frameOffset, ...this.timestamp(this.frame[2]), ...decoded });
  }

  private timestamp(elapsedUs: number): NsgTimestamp {
    if (this.epochUs === null) this.fail("Decoded NSG event precedes the time anchor");
    const timestampUs = this.epochUs + BigInt(elapsedUs);
    const timestampMs = Number(timestampUs / 1000n);
    if (!Number.isFinite(new Date(timestampMs).getTime())) this.fail("NSG event timestamp is outside the supported date range");
    return { elapsedUs, timestampUs: timestampUs.toString(), timestampMs };
  }

  private decodeEvent(payload: Uint8Array, marker: number): void {
    let data: unknown;
    try {
      data = JSON.parse(this.decoder.decode(payload));
    } catch {
      this.fail("Invalid UTF-8 or JSON in a decoded NSG event");
    }
    if (!isObject(data)) this.fail("Expected an NSG JSON event object");
    const event: NsgEvent = {
      id: this.eventCount++,
      name: typeof data.event === "string" ? data.event : "<missing>",
      marker,
      recordOffset: this.frameOffset,
      frameFields: [this.frame[0], this.frame[1], this.frame[4]],
      ...this.timestamp(this.frame[2]),
      data,
    };
    if (this.retainHistory) this.events.push(event);
    this.decodedBytes += payload.length;
    this.eventTypeCounts.set(event.name, (this.eventTypeCounts.get(event.name) ?? 0) + 1);
    this.operators.observe(event);
    if (event.name === "ScheduleCellInfo") this.decodeCells(event);
    if (event.name === "change" && this.retainHistory) this.decodeLocation(event);
    this.options.onEvent?.(event);
  }

  private decodeCells(event: NsgEvent): void {
    const cells = event.data.cells;
    if (!Array.isArray(cells)) this.fail("Expected a cells array in an NSG measurement event");
    let lteAnchor: NsgCell | null = null;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const raw = cells[cellIndex];
      if (!isObject(raw)) this.fail("Expected an NSG cell object");
      const cell: NsgCell = {
        eventIndex: event.id,
        cellIndex,
        recordOffset: event.recordOffset,
        elapsedUs: event.elapsedUs,
        timestampUs: event.timestampUs,
        timestampMs: event.timestampMs,
        rat: (text(raw.type) ?? "unknown").toUpperCase(),
        registered: boolean(raw.registered),
        subId: numeric(event.data.subId),
        slotId: numeric(event.data.slotId),
        isDefault: boolean(event.data.default),
        mcc: text(raw.mcc),
        mnc: text(raw.mnc),
        ...radioFields(raw),
        raw,
      };
      const operator = cell.registered === true ? this.operators.get(cell) : null;
      if (operator !== null) {
        cell.mcc = operator.mcc;
        cell.mnc = operator.mnc;
        raw.mcc = operator.mcc;
        raw.mnc = operator.mnc;
      }
      if (lteAnchor === null && cell.rat === "LTE" && cell.registered === true) lteAnchor = cell;
      this.emitCell(cell);
    }
    if (lteAnchor !== null && this.retainHistory)
      this.lteAnchors.push({
        cell: lteAnchor,
        derivedCellIndexOffset: cells.length,
      });
  }

  private emitCell(cell: NsgCell): void {
    this.cellCount++;
    if (this.retainHistory) this.cells.push(cell);
    if (cell.registered === true) this.servingCellCount++;
    if (!this.retainHistory) this.options.onCell?.(cell);
  }

  private emitRetainedCellCallbacks(): void {
    const { onCell } = this.options;
    if (!this.retainHistory || onCell === undefined) return;
    // Retained callbacks run after NSA association so observers see final roles and ordering.
    for (const cell of this.cells) onCell(cell);
  }

  private emitAssociatedNrCells(): void {
    const associations = associateQualcommNsaMeasurements(this.lteAnchors, this.nrMeasurements);
    for (const { anchor, derivedCells } of associations) {
      anchor.measurementRole = "lte-secondary";
      anchor.raw.measurementRole = "lte-secondary";
      for (const cell of derivedCells) {
        this.cellCount++;
        if (cell.registered === true) this.servingCellCount++;
      }
    }
    if (associations.length > 0) {
      const mergedCells = mergeAssociatedNsaCells(this.cells, associations);
      this.cells.length = 0;
      for (const cell of mergedCells) this.cells.push(cell);
    }
    this.lteAnchors.length = 0;
    this.nrMeasurements.length = 0;
  }

  private decodeLocation(event: NsgEvent): void {
    const latitude = numeric(event.data.latitude);
    const longitude = numeric(event.data.longitude);
    if (latitude === null || longitude === null || !isValidLatLng(latitude, longitude)) return;
    const fixSeconds = numeric(event.data.time);
    this.locations.push({
      eventIndex: event.id,
      elapsedUs: event.elapsedUs,
      timestampUs: event.timestampUs,
      timestampMs: event.timestampMs,
      latitude,
      longitude,
      accuracy: numeric(event.data.accuracy),
      altitude: numeric(event.data.altitude),
      speed: numeric(event.data.speed),
      provider: text(event.data.provider),
      fixTimestampMs: fixSeconds === null ? null : fixSeconds * 1000,
    });
  }

  progress(): NsgProgress {
    const pendingLimit = Math.min(Math.max(0, this.source.size - 1), Math.floor(this.source.size * 0.99));
    const bytesRead = this.finished ? this.source.size : Math.min(this.source.inputBytesRead?.() ?? this.offset, pendingLimit);
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
    if (
      (this.expectedDecodedSize !== null && this.offset !== this.expectedDecodedSize) ||
      this.phase !== "header" ||
      this.frame.length !== 0 ||
      this.varintBytes !== 0
    )
      this.fail("Truncated NSG log");
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
      decodedBytes: this.decodedBytes,
      servingCellCount: this.servingCellCount,
      signalingRecordCount: this.signalingRecordCount,
      signalingTruncated: this.signalingTruncated,
      events: this.events,
      cells: this.cells,
      signaling: this.signaling,
      locations: this.locations,
    };
    this.emitRetainedCellCallbacks();
    return this.result;
  }
}

export async function parseNsgStream(
  stream: ReadableStream<Uint8Array>,
  source: NsgSource,
  onProgress?: (progress: NsgProgress) => void,
  options?: NsgParseOptions,
): Promise<NsgLog> {
  const parser = new NsgStreamParser(source, options);
  const reader = stream.getReader();
  let lastProgress = 0;
  try {
    onProgress?.(parser.progress());
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Read each chunk in order without buffering the complete log.
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(value);
      const now = performance.now();
      if (now - lastProgress >= 100) {
        onProgress?.(parser.progress());
        lastProgress = now;
      }
    }
    const log = parser.finish();
    onProgress?.(parser.progress());
    return log;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
