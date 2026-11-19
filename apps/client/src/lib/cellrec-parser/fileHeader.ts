export const CELLREC_MAGIC = [0x89, 0x43, 0x52, 0x45, 0x43, 0x0d, 0x0a, 0x1a];

export function isCellrecFileHeader(bytes: Uint8Array): boolean {
  return bytes.length >= CELLREC_MAGIC.length && CELLREC_MAGIC.every((byte, index) => bytes[index] === byte);
}
