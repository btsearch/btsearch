import { Gunzip } from "fflate";

import { NSG_MAGIC } from "./internal/container";
import type { NsgParseInput } from "./model";

const GZIP_MAGIC = [0x1f, 0x8b] as const;
const GZIP_INPUT_BATCH_BYTES = 256 * 1024;
const GZIP_TRAILER_BYTES = 8;
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, byte) => {
  let crc = byte;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) === 0 ? crc >>> 1 : 0xedb88320 ^ (crc >>> 1);
  return crc >>> 0;
});
const GZIP_BOUNDARY_SENTINEL = Uint8Array.of(
  0x1f,
  0x8b,
  0x08,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x03,
  0x03,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
);

type GzipMember = Readonly<{
  endOffset: number;
  size: number;
  crc32: number;
}>;

function hasMagic(header: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => header[index] === byte);
}

function updateCrc32(crc: number, bytes: Uint8Array): number {
  let next = crc;
  for (const byte of bytes) next = CRC32_TABLE[(next ^ byte) & 0xff] ^ (next >>> 8);
  return next >>> 0;
}

async function validateGzipMembers(file: File, members: readonly GzipMember[]): Promise<void> {
  const trailers = await Promise.all(
    members.map((member) => {
      if (member.endOffset < GZIP_TRAILER_BYTES || member.endOffset > file.size) throw new Error("Invalid gzip member boundary.");
      return file.slice(member.endOffset - GZIP_TRAILER_BYTES, member.endOffset).arrayBuffer();
    }),
  );

  for (const [index, member] of members.entries()) {
    const trailer = trailers[index];
    if (trailer.byteLength !== GZIP_TRAILER_BYTES) throw new Error("Truncated gzip member trailer.");
    const view = new DataView(trailer);
    if (view.getUint32(0, true) !== member.crc32) throw new Error("Invalid gzip member checksum.");
    if (view.getUint32(4, true) !== member.size) throw new Error("Invalid gzip member size.");
  }
}

function isGzipHeader(header: Uint8Array): boolean {
  return hasMagic(header, GZIP_MAGIC);
}

export function isNsgFileHeader(header: Uint8Array): boolean {
  return hasMagic(header, NSG_MAGIC) || isGzipHeader(header);
}

export async function openNsgFile(file: File): Promise<NsgParseInput> {
  const header = new Uint8Array(await file.slice(0, GZIP_MAGIC.length).arrayBuffer());
  if (!isGzipHeader(header)) return { stream: file.stream(), source: { name: file.name, size: file.size } };

  let bytesRead = 0;
  let finalMemberCompleted = false;
  let memberSize = 0;
  let memberCrc32 = 0xffffffff;
  let gunzip: Gunzip | null = null;
  const members: GzipMember[] = [];
  let pendingChunks: Uint8Array[] = [];
  let pendingBytes = 0;

  function completeMember(endOffset: number): void {
    members.push({ endOffset, size: memberSize, crc32: (memberCrc32 ^ 0xffffffff) >>> 0 });
    memberSize = 0;
    memberCrc32 = 0xffffffff;
    if (endOffset === file.size) finalMemberCompleted = true;
  }

  function pushPendingChunks(): void {
    if (pendingBytes === 0) return;
    if (gunzip === null) throw new Error("The gzip decoder was not initialized.");
    let chunk = pendingChunks[0];
    if (pendingChunks.length > 1) {
      chunk = new Uint8Array(pendingBytes);
      let offset = 0;
      for (const pendingChunk of pendingChunks) {
        chunk.set(pendingChunk, offset);
        offset += pendingChunk.byteLength;
      }
    }
    pendingChunks = [];
    pendingBytes = 0;
    gunzip.push(chunk);
  }

  const stream = file.stream().pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        gunzip = new Gunzip((chunk) => {
          if (chunk.byteLength === 0) return;
          memberSize = (memberSize + chunk.byteLength) >>> 0;
          memberCrc32 = updateCrc32(memberCrc32, chunk);
          controller.enqueue(chunk);
        });
        gunzip.onmember = completeMember;
      },
      transform(chunk) {
        if (chunk.byteLength === 0) return;
        bytesRead += chunk.byteLength;
        pendingChunks.push(chunk);
        pendingBytes += chunk.byteLength;
        if (pendingBytes >= GZIP_INPUT_BATCH_BYTES) pushPendingChunks();
      },
      async flush() {
        if (gunzip === null) throw new Error("The gzip decoder was not initialized.");
        pushPendingChunks();
        gunzip.push(GZIP_BOUNDARY_SENTINEL, true);
        if (!finalMemberCompleted) throw new Error("Truncated gzip member trailer.");
        await validateGzipMembers(file, members);
      },
    }),
  );

  function inputBytesRead(): number {
    return bytesRead;
  }

  return {
    stream,
    source: { name: file.name, size: file.size, decodedSize: null, inputBytesRead },
  };
}
