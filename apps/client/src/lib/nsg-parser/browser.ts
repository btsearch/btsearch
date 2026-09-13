import { AsyncGunzip } from "fflate";

import { NSG_MAGIC } from "./internal/container";
import type { NsgParseInput } from "./model";

const GZIP_MAGIC = [0x1f, 0x8b] as const;
const GZIP_INPUT_BATCH_BYTES = 256 * 1024;
const GZIP_MAX_QUEUED_BYTES = 2 * GZIP_INPUT_BATCH_BYTES;
const GZIP_TRAILER_BYTES = 8;
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
}>;

type PendingPush = Readonly<{
  resolve: () => void;
  reject: (reason?: unknown) => void;
}>;

type StreamingGunzip = Readonly<{
  push: (chunk: Uint8Array, final?: boolean) => Promise<void>;
  terminate: (reason?: unknown) => void;
}>;

function hasMagic(header: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => header[index] === byte);
}

function createAsyncGunzip(onData: (chunk: Uint8Array) => void, onMember: (offset: number) => void): StreamingGunzip {
  let failure: unknown = null;
  let pendingDrain: PendingPush | null = null;
  let pendingFinal: PendingPush | null = null;
  let gunzip: AsyncGunzip | null = null;

  function fail(reason: unknown): void {
    if (failure !== null) return;
    failure = reason;
    pendingDrain?.reject(reason);
    pendingFinal?.reject(reason);
    pendingDrain = null;
    pendingFinal = null;
    gunzip?.terminate();
  }

  gunzip = new AsyncGunzip((error, chunk, final) => {
    if (error !== null) {
      fail(error);
      return;
    }
    if (failure !== null) return;
    try {
      onData(chunk);
    } catch (error) {
      fail(error);
      return;
    }
    if (!final) return;
    pendingFinal?.resolve();
    pendingFinal = null;
  });
  gunzip.onmember = onMember;
  gunzip.ondrain = () => {
    if (gunzip !== null && gunzip.queuedSize >= GZIP_MAX_QUEUED_BYTES) return;
    pendingDrain?.resolve();
    pendingDrain = null;
  };

  return {
    push(chunk, final = false) {
      if (failure !== null) return Promise.reject(failure);
      return new Promise<void>((resolve, reject) => {
        if (final) pendingFinal = { resolve, reject };
        try {
          gunzip?.push(chunk, final);
          if (!final && (gunzip?.queuedSize ?? 0) < GZIP_MAX_QUEUED_BYTES) resolve();
          else if (!final) pendingDrain = { resolve, reject };
        } catch (error) {
          reject(error);
          fail(error);
        }
      });
    },
    terminate(reason = new DOMException("The gzip stream was cancelled.", "AbortError")) {
      fail(reason);
    },
  };
}

function createStreamingGunzip(onData: (chunk: Uint8Array) => void, onMember: (offset: number) => void): StreamingGunzip {
  return createAsyncGunzip(onData, onMember);
}

async function validateGzipMemberSizes(file: File, members: readonly GzipMember[]): Promise<void> {
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
  let gunzip: StreamingGunzip | null = null;
  const members: GzipMember[] = [];
  let pendingChunks: Uint8Array[] = [];
  let pendingBytes = 0;

  function completeMember(endOffset: number): void {
    members.push({ endOffset, size: memberSize });
    memberSize = 0;
    if (endOffset === file.size) finalMemberCompleted = true;
  }

  async function pushPendingChunks(): Promise<void> {
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
    await gunzip.push(chunk);
  }

  const transformedStream = file.stream().pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        gunzip = createStreamingGunzip((chunk) => {
          if (chunk.byteLength === 0) return;
          memberSize = (memberSize + chunk.byteLength) >>> 0;
          controller.enqueue(chunk);
        }, completeMember);
      },
      async transform(chunk) {
        if (chunk.byteLength === 0) return;
        bytesRead += chunk.byteLength;
        pendingChunks.push(chunk);
        pendingBytes += chunk.byteLength;
        if (pendingBytes >= GZIP_INPUT_BATCH_BYTES) await pushPendingChunks();
      },
      async flush() {
        if (gunzip === null) throw new Error("The gzip decoder was not initialized.");
        await pushPendingChunks();
        await gunzip.push(GZIP_BOUNDARY_SENTINEL.slice(), true);
        if (!finalMemberCompleted) throw new Error("Truncated gzip member trailer.");
        await validateGzipMemberSizes(file, members);
      },
    }),
  );
  const reader = transformedStream.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) controller.close();
        else controller.enqueue(result.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      gunzip?.terminate(reason);
      await reader.cancel(reason);
    },
  });

  function inputBytesRead(): number {
    return bytesRead;
  }

  return {
    stream,
    source: { name: file.name, size: file.size, decodedSize: null, inputBytesRead },
  };
}
