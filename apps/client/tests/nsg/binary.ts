export function bytesFromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function encodeVarint(value: number | bigint): Uint8Array {
  let remaining = BigInt(value);
  const bytes: number[] = [];
  do {
    const byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    bytes.push(remaining > 0 ? byte | 0x80 : byte);
  } while (remaining > 0);
  return Uint8Array.from(bytes);
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes);
}

export function setUint16LE(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true);
  return bytes;
}
