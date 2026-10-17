import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { pipeline } from "node:stream";
import { createInflateRaw } from "node:zlib";

const END_OF_DIRECTORY_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const END_OF_DIRECTORY_SIZE = 22;
const MAX_ARCHIVE_COMMENT_SIZE = 0xffff;
const DIRECTORY_ENTRY_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const ZIP64_MARKER = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;
const READ_CHUNK_SIZE = 1 << 20;

export type ZipEntry = { name: string; method: number; compressedSize: number; headerOffset: number };
export type ZipArchive = { path: string; entries: ReadonlyMap<string, ZipEntry> };

async function readBytes(path: string, position: number, length: number): Promise<Buffer> {
  const handle = await open(path);
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(length), 0, length, position);
    if (bytesRead < length) throw new Error(`"${path}" ends inside its zip structure`);
    return buffer;
  } finally {
    await handle.close();
  }
}

function readDirectory(path: string, directory: Buffer): Map<string, ZipEntry> {
  const entries = new Map<string, ZipEntry>();
  let position = 0;
  while (position + DIRECTORY_ENTRY_SIZE <= directory.length && directory.readUInt32LE(position) === DIRECTORY_ENTRY_SIGNATURE) {
    const nameEnd = position + DIRECTORY_ENTRY_SIZE + directory.readUInt16LE(position + 28);
    const entry = {
      name: directory.toString("utf8", position + DIRECTORY_ENTRY_SIZE, nameEnd),
      method: directory.readUInt16LE(position + 10),
      compressedSize: directory.readUInt32LE(position + 20),
      headerOffset: directory.readUInt32LE(position + 42),
    };
    const isZip64 = entry.compressedSize === ZIP64_MARKER || entry.headerOffset === ZIP64_MARKER;
    if (isZip64) throw new Error(`"${path}" is a ZIP64 archive, which is not supported`);

    entries.set(entry.name.toLowerCase(), entry);
    position = nameEnd + directory.readUInt16LE(position + 30) + directory.readUInt16LE(position + 32);
  }

  return entries;
}

export async function openZip(path: string): Promise<ZipArchive> {
  const { size } = await stat(path);
  const tailLength = Math.min(size, END_OF_DIRECTORY_SIZE + MAX_ARCHIVE_COMMENT_SIZE);
  const tail = await readBytes(path, size - tailLength, tailLength);
  const end = tail.lastIndexOf(END_OF_DIRECTORY_SIGNATURE, tailLength - END_OF_DIRECTORY_SIZE);
  if (end < 0) throw new Error(`"${path}" is not a zip archive`);

  const directoryOffset = tail.readUInt32LE(end + 16);
  if (directoryOffset === ZIP64_MARKER) throw new Error(`"${path}" is a ZIP64 archive, which is not supported`);

  return { path, entries: readDirectory(path, await readBytes(path, directoryOffset, tail.readUInt32LE(end + 12))) };
}

export function findZipEntry(archive: ZipArchive, name: string): ZipEntry | undefined {
  return archive.entries.get(name.toLowerCase());
}

async function readEntryData(archive: ZipArchive, entry: ZipEntry): Promise<AsyncIterable<Buffer>> {
  const header = await readBytes(archive.path, entry.headerOffset, LOCAL_HEADER_SIZE);
  if (header.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) throw new Error(`"${archive.path}" has a broken entry "${entry.name}"`);

  const start = entry.headerOffset + LOCAL_HEADER_SIZE + header.readUInt16LE(26) + header.readUInt16LE(28);
  return createReadStream(archive.path, { start, end: start + entry.compressedSize - 1, highWaterMark: READ_CHUNK_SIZE });
}

export async function* inflateZipEntry(archive: ZipArchive, entry: ZipEntry): AsyncGenerator<Uint8Array> {
  if (entry.method !== STORED && entry.method !== DEFLATED) {
    throw new Error(`"${archive.path}" compresses "${entry.name}" with method ${entry.method}, which is not supported`);
  }
  if (entry.compressedSize === 0) return;

  const data = await readEntryData(archive, entry);
  if (entry.method === STORED) {
    yield* data;
    return;
  }

  yield* pipeline(data, createInflateRaw({ chunkSize: READ_CHUNK_SIZE }), () => {});
}

export async function readZipEntry(archive: ZipArchive, entry: ZipEntry): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of inflateZipEntry(archive, entry)) chunks.push(chunk);
  return Buffer.concat(chunks);
}
