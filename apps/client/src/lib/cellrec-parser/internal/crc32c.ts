const CASTAGNOLI_REFLECTED = 0x82f63b78;

const TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ CASTAGNOLI_REFLECTED : value >>> 1;
  return value >>> 0;
});

export function crc32c(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index++) crc = TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
