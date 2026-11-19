import { decompress } from "fzstd";

import type { NsgJsonObject } from "../../nsg-parser/model";
import { CELLREC_MAGIC } from "../fileHeader";
import { crc32c } from "./crc32c";
import { FILE_INFO, KIND_BLOCK_INDEX, KIND_CELL_DEF, KIND_EVENT, KIND_READING, RECORD_KINDS, decodeMessage } from "./schema";
import { MalformedWireError, WireMessage, WireReader } from "./wire";

const SUPPORTED_MAJOR = 1;
const FILE_HEADER_FIXED_BYTES = 16;
const MAX_HEADER_BODY_BYTES = 1024 * 1024;
const BLOCK_SYNC = [0x89, 0x43, 0x52, 0x42];
const BLOCK_HEADER_BYTES = 52;
const BLOCK_HEADER_CRC_END = 48;
const MAX_BLOCK_HEADER_BYTES = 4096;
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const MAX_INT32 = 2 ** 31 - 1;
const MAX_SAFE_HIGH_WORD = 0x1fffff;
const CODEC_NONE = 0;
const CODEC_ZSTD = 1;
const FLAG_INDEX = 2;
const MAX_RECORD_VARINT_BYTES = 8;

export type CellrecProblemKind = "damagedHeader" | "truncated" | "damagedPayload" | "unknownCodec" | "malformedRecord";
export type CellrecProblem = Readonly<{ kind: CellrecProblemKind; offset: number; sequence: number | null; t: number; message: string }>;

export type CellrecFileHeader = Readonly<{ formatMinor: number; info: NsgJsonObject; dataOffset: number }>;

export type BlockHeader = Readonly<{
  offset: number;
  headerLength: number;
  codec: number;
  flags: number;
  sequence: number;
  firstT: number;
  lastT: number;
  recordCount: number;
  rawLength: number;
  storedLength: number;
  payloadCrc: number;
  end: number;
}>;

export type CellrecRecord = Readonly<{ kind: number; name: string; t: number | null; offset: number; body: NsgJsonObject }>;

export function readFileHeader(bytes: Uint8Array): CellrecFileHeader {
  if (!CELLREC_MAGIC.every((byte, index) => index >= bytes.length || bytes[index] === byte)) throw new Error("This is not a Cellrec file");
  if (bytes.length < FILE_HEADER_FIXED_BYTES) throw new Error("This Cellrec file ends inside its header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const formatMajor = view.getUint16(8, true);
  if (formatMajor !== SUPPORTED_MAJOR) throw new Error(`Cellrec format ${formatMajor} is not supported`);
  const bodyLength = view.getUint32(12, true);
  if (bodyLength > MAX_HEADER_BODY_BYTES) throw new Error("This Cellrec file header is too large");
  const crcOffset = FILE_HEADER_FIXED_BYTES + bodyLength;
  if (bytes.length < crcOffset + 4) throw new Error("This Cellrec file ends inside its header");
  if (crc32c(bytes, 0, crcOffset) !== view.getUint32(crcOffset, true)) throw new Error("This Cellrec file header is damaged");
  const info = decodeMessage(new WireMessage(bytes, FILE_HEADER_FIXED_BYTES, crcOffset), FILE_INFO);
  return { formatMinor: view.getUint16(10, true), info, dataOffset: crcOffset + 4 };
}

function readUint64(view: DataView, offset: number): number | null {
  const high = view.getUint32(offset + 4, true);
  return high > MAX_SAFE_HIGH_WORD ? null : high * 2 ** 32 + view.getUint32(offset, true);
}

function decodeBlockHeader(bytes: Uint8Array, offset: number): BlockHeader | null {
  if (bytes.length - offset < BLOCK_HEADER_BYTES || !BLOCK_SYNC.every((byte, index) => bytes[offset + index] === byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, BLOCK_HEADER_BYTES);
  if (crc32c(bytes, offset, offset + BLOCK_HEADER_CRC_END) !== view.getUint32(BLOCK_HEADER_CRC_END, true)) return null;
  const headerLength = view.getUint16(4, true);
  const codec = view.getUint8(7);
  const sequence = view.getUint32(12, true);
  const firstT = readUint64(view, 16);
  const lastT = readUint64(view, 24);
  const recordCount = view.getUint32(32, true);
  const rawLength = view.getUint32(36, true);
  const storedLength = view.getUint32(40, true);
  if (headerLength < BLOCK_HEADER_BYTES || headerLength > MAX_BLOCK_HEADER_BYTES || view.getUint8(6) < 1) return null;
  if (sequence > MAX_INT32 || recordCount > MAX_INT32 || firstT === null || lastT === null || firstT > lastT) return null;
  if (rawLength > MAX_PAYLOAD_BYTES || storedLength > MAX_PAYLOAD_BYTES || (codec === CODEC_NONE && rawLength !== storedLength)) return null;
  return {
    offset,
    headerLength,
    codec,
    flags: view.getUint16(8, true),
    sequence,
    firstT,
    lastT,
    recordCount,
    rawLength,
    storedLength,
    payloadCrc: view.getUint32(44, true),
    end: offset + headerLength + storedLength,
  };
}

function resync(bytes: Uint8Array, from: number): BlockHeader | null {
  for (let offset = bytes.indexOf(BLOCK_SYNC[0], from); offset !== -1; offset = bytes.indexOf(BLOCK_SYNC[0], offset + 1)) {
    const header = decodeBlockHeader(bytes, offset);
    if (header) return header;
  }
  return null;
}

export function* walkBlocks(bytes: Uint8Array, dataOffset: number, problems: CellrecProblem[]): Generator<BlockHeader> {
  let offset = dataOffset;
  let lastT = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < BLOCK_HEADER_BYTES) {
      problems.push({ kind: "truncated", offset, sequence: null, t: lastT, message: "The file ends inside a block header" });
      return;
    }
    let header = decodeBlockHeader(bytes, offset);
    if (header === null) {
      problems.push({ kind: "damagedHeader", offset, sequence: null, t: lastT, message: "A block header is damaged" });
      header = resync(bytes, offset + 1);
      if (header === null) return;
    }
    if (header.end > bytes.length) {
      problems.push({
        kind: "truncated",
        offset: header.offset,
        sequence: header.sequence,
        t: header.firstT,
        message: "The file ends inside a block",
      });
      return;
    }
    lastT = header.lastT;
    yield header;
    offset = header.end;
  }
}

export function isIndexBlock(header: BlockHeader): boolean {
  return (header.flags & FLAG_INDEX) !== 0;
}

export function readPayload(bytes: Uint8Array, header: BlockHeader, problems: CellrecProblem[]): Uint8Array | null {
  const start = header.offset + header.headerLength;
  const stored = bytes.subarray(start, start + header.storedLength);
  const problem = (kind: CellrecProblemKind, message: string) =>
    problems.push({ kind, offset: header.offset, sequence: header.sequence, t: header.firstT, message });
  if (header.codec !== CODEC_NONE && header.codec !== CODEC_ZSTD) {
    problem("unknownCodec", `Block ${header.sequence} uses codec ${header.codec}, which this reader does not know`);
    return null;
  }
  if (crc32c(stored) !== header.payloadCrc) {
    problem("damagedPayload", `Block ${header.sequence} has a damaged payload`);
    return null;
  }
  if (header.codec === CODEC_NONE) return stored;
  try {
    const raw = decompress(stored, new Uint8Array(header.rawLength));
    if (raw.length === header.rawLength) return raw;
  } catch {
    problem("damagedPayload", `Block ${header.sequence} does not decompress`);
    return null;
  }
  problem("damagedPayload", `Block ${header.sequence} decompresses to the wrong length`);
  return null;
}

function resolveCell(cells: ReadonlyMap<number, NsgJsonObject>, id: number | undefined): NsgJsonObject {
  const cell = id === undefined ? undefined : cells.get(id);
  if (cell === undefined) throw new MalformedWireError(`Cell ${id ?? "(none)"} is not defined in this block`);
  return cell;
}

function decodeBody(kind: number, message: WireMessage, cells: Map<number, NsgJsonObject>): NsgJsonObject {
  const recordKind = RECORD_KINDS.get(kind);
  const body = recordKind === undefined ? {} : decodeMessage(message, recordKind.schema);
  if (kind === KIND_CELL_DEF) {
    if (typeof body.id !== "number") throw new MalformedWireError("A cell definition has no id");
    cells.set(body.id, body);
  } else if (kind === KIND_READING && Array.isArray(body.measurements))
    body.measurements = body.measurements.map((measurement) => {
      if (measurement === null || typeof measurement !== "object" || Array.isArray(measurement))
        throw new MalformedWireError("A measurement is not a message");
      return { ...measurement, cell: resolveCell(cells, typeof measurement.cell === "number" ? measurement.cell : undefined) };
    });
  else if (kind === KIND_EVENT)
    for (const key of ["fromCell", "toCell"]) {
      const id = body[key];
      if (typeof id === "number") body[key] = resolveCell(cells, id);
    }
  return body;
}

export function decodeRecords(payload: Uint8Array, header: BlockHeader, problems: CellrecProblem[]): CellrecRecord[] {
  const records: CellrecRecord[] = [];
  const cells = new Map<number, NsgJsonObject>();
  const reader = new WireReader(payload);
  const problem = (message: string) =>
    problems.push({ kind: "malformedRecord", offset: header.offset, sequence: header.sequence, t: header.firstT, message });
  while (!reader.done) {
    let kind: number;
    let bodyStart: number;
    try {
      kind = reader.varint(MAX_RECORD_VARINT_BYTES);
      const length = reader.varint(MAX_RECORD_VARINT_BYTES);
      if (length > MAX_INT32 || length > reader.end - reader.position) throw new MalformedWireError("A record runs past the end of its block");
      bodyStart = reader.position;
      reader.position += length;
    } catch (error) {
      problem(`The rest of block ${header.sequence} cannot be framed: ${error instanceof Error ? error.message : String(error)}`);
      return records;
    }
    if (kind === KIND_BLOCK_INDEX) continue;
    if (kind === 0 || kind > MAX_INT32) {
      problem(`Block ${header.sequence} holds a record of kind ${kind}`);
      continue;
    }
    const recordKind = RECORD_KINDS.get(kind);
    try {
      const message = new WireMessage(payload, bodyStart, reader.position);
      const body = decodeBody(kind, message, cells);
      const isTimed = recordKind?.isTimed ?? true;
      const delta = isTimed ? message.uint(1) : undefined;
      const t = isTimed ? header.firstT + (delta ?? 0) : null;
      records.push({ kind, name: recordKind?.name ?? `kind${kind}`, t, offset: header.offset, body });
    } catch (error) {
      if (!(error instanceof MalformedWireError)) throw error;
      problem(`A ${recordKind?.name ?? `kind ${kind}`} record in block ${header.sequence} is malformed: ${error.message}`);
    }
  }
  return records;
}
