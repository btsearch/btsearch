import type { NsgSource } from "./parser";

export const NSG_MAGIC = [0x21, 0x4e, 0x53, 0x47] as const;
const GZIP_MAGIC = [0x1f, 0x8b] as const;

export type NsgFileStream = Readonly<{
  stream: ReadableStream<Uint8Array>;
  source: NsgSource;
}>;

function hasMagic(header: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => header[index] === byte);
}

export function isGzipHeader(header: Uint8Array): boolean {
  return hasMagic(header, GZIP_MAGIC);
}

export function isNsgFileHeader(header: Uint8Array): boolean {
  return hasMagic(header, NSG_MAGIC) || isGzipHeader(header);
}

export async function openNsgFile(file: File): Promise<NsgFileStream> {
  const header = new Uint8Array(await file.slice(0, GZIP_MAGIC.length).arrayBuffer());
  if (!isGzipHeader(header)) return { stream: file.stream(), source: { name: file.name, size: file.size } };

  let bytesRead = 0;
  const compressedStream = file.stream().pipeThrough(
    new TransformStream<Uint8Array<ArrayBuffer>, BufferSource>({
      transform(chunk, controller) {
        bytesRead += chunk.byteLength;
        controller.enqueue(chunk);
      },
    }),
  );

  function inputBytesRead(): number {
    return bytesRead;
  }

  return {
    stream: compressedStream.pipeThrough(new DecompressionStream("gzip")),
    source: { name: file.name, size: file.size, decodedSize: null, inputBytesRead },
  };
}
