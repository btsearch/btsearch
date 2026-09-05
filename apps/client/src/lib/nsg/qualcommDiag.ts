export type QualcommDiagHeader = Readonly<{
  packetLength: number;
  logCode: number;
  view: DataView;
}>;
export type QualcommDiagPrefix = Pick<QualcommDiagHeader, "packetLength" | "logCode">;

export function readDiagPrefix(payload: Uint8Array): QualcommDiagPrefix | null {
  if (payload.byteLength < 4) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { packetLength: view.getUint16(0, true), logCode: view.getUint16(2, true) };
}

export function readDiagHeader(payload: Uint8Array, maximumBytes: number, parsedPrefix?: QualcommDiagPrefix): QualcommDiagHeader | null {
  if (payload.byteLength < 12) return null;
  const prefix = parsedPrefix ?? readDiagPrefix(payload);
  if (prefix === null || prefix.packetLength < 12 || prefix.packetLength > payload.byteLength || prefix.packetLength > maximumBytes) return null;
  return { ...prefix, view: new DataView(payload.buffer, payload.byteOffset, prefix.packetLength) };
}
