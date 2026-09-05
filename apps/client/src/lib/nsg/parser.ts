import { NSG_MAGIC } from "./fileStream";
import { NsgStreamingOperatorResolver } from "./operator";
import type { NsgCell, NsgEvent, NsgJsonObject, NsgLocation, NsgLog, NsgProgress, NsgTimestamp } from "./types";

const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
export type NsgSource = Readonly<{
  name: string;
  size: number;
  decodedSize?: number | null;
  inputBytesRead?: () => number;
}>;
type Phase = "magic" | "xmlLength" | "xml" | "header" | "prefix" | "payload";
export type NsgParseOptions = { retainHistory?: boolean; onCell?: (cell: NsgCell) => void; onEvent?: (event: NsgEvent) => void };

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
  private finished = false;
  private readonly recordTypeCounts = new Map<number, number>();
  private readonly eventTypeCounts = new Map<string, number>();
  private readonly events: NsgEvent[] = [];
  private readonly cells: NsgCell[] = [];
  private readonly locations: NsgLocation[] = [];
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly operators = new NsgStreamingOperatorResolver();
  private readonly expectedDecodedSize: number | null;

  constructor(
    private readonly source: NsgSource,
    private readonly options: NsgParseOptions = {},
  ) {
    if (!Number.isSafeInteger(source.size) || source.size < 0) throw new Error("Invalid NSG file size.");
    this.expectedDecodedSize = source.decodedSize === undefined ? source.size : source.decodedSize;
    if (this.expectedDecodedSize !== null && (!Number.isSafeInteger(this.expectedDecodedSize) || this.expectedDecodedSize < 0))
      throw new Error("Invalid decoded NSG file size.");
  }

  private fail(message: string): never {
    throw new Error(`${message} (byte ${this.offset}).`);
  }

  push(chunk: Uint8Array): void {
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

      const length = Math.min(this.remaining, chunk.length - position);
      if (this.payload !== null) {
        this.payload.set(chunk.subarray(position, position + length), this.payloadPosition);
        this.payloadPosition += length;
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
    this.marker = null;
    this.phase = "payload";
    if (recordType === 0) {
      if (this.epochUs !== null || elapsedUs !== 0 || length !== 8) this.fail("Unsupported NSG time anchor");
      this.payload = new Uint8Array(8);
    } else if (recordType === 53 && length > 0) this.phase = "prefix";
    if (length === 0) this.completePayload();
  }

  private completePayload(): void {
    if (this.frame[3] === 0) {
      this.epochUs = new DataView(this.payload!.buffer).getBigUint64(0, true);
      if (!Number.isFinite(new Date(Number(this.epochUs / 1000n)).getTime())) this.fail("NSG time anchor is outside the supported date range");
    } else if (this.payload !== null && this.marker !== null) this.decodeEvent(this.payload, this.marker);
    this.payload = null;
    this.frame.length = 0;
    this.phase = "header";
    this.frameOffset = this.offset;
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
    if (this.options.retainHistory !== false) this.events.push(event);
    this.decodedBytes += payload.length;
    this.eventTypeCounts.set(event.name, (this.eventTypeCounts.get(event.name) ?? 0) + 1);
    this.operators.observe(event);
    if (event.name === "ScheduleCellInfo") this.decodeCells(event);
    if (event.name === "change" && this.options.retainHistory !== false) this.decodeLocation(event);
    this.options.onEvent?.(event);
  }

  private decodeCells(event: NsgEvent): void {
    const cells = event.data.cells;
    if (!Array.isArray(cells)) this.fail("Expected a cells array in an NSG measurement event");
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
        raw,
      };
      const operator = cell.registered === true ? this.operators.get(cell) : null;
      if (operator !== null) {
        cell.mcc = operator.mcc;
        cell.mnc = operator.mnc;
        raw.mcc = operator.mcc;
        raw.mnc = operator.mnc;
      }
      this.cellCount++;
      if (this.options.retainHistory !== false) this.cells.push(cell);
      if (cell.registered === true) this.servingCellCount++;
      this.options.onCell?.(cell);
    }
  }

  private decodeLocation(event: NsgEvent): void {
    const latitude = numeric(event.data.latitude);
    const longitude = numeric(event.data.longitude);
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
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
    const bytesRead = this.finished ? this.source.size : Math.min(this.source.inputBytesRead?.() ?? this.offset, Math.max(0, this.source.size - 1));
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
    if (
      (this.expectedDecodedSize !== null && this.offset !== this.expectedDecodedSize) ||
      this.phase !== "header" ||
      this.frame.length !== 0 ||
      this.varintBytes !== 0
    )
      this.fail("Truncated NSG log");
    if (this.epochUs === null) this.fail("No supported NSG time anchor found");
    const end = this.timestamp(this.maximumElapsedUs);
    this.finished = true;
    return {
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
      events: this.events,
      cells: this.cells,
      locations: this.locations,
    };
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
