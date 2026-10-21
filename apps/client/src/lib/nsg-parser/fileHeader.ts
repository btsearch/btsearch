import { NSG_MAGIC } from "./internal/container";

export const GZIP_MAGIC = [0x1f, 0x8b] as const;

function hasMagic(header: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => header[index] === byte);
}

export function isGzipHeader(header: Uint8Array): boolean {
  return hasMagic(header, GZIP_MAGIC);
}

export function isNsgFileHeader(header: Uint8Array): boolean {
  return hasMagic(header, NSG_MAGIC) || isGzipHeader(header);
}
