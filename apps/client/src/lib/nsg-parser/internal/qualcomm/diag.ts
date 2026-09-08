export type QualcommDiagHeader = Readonly<{
  packetLength: number;
  logCode: number;
  view: DataView;
}>;
export type QualcommDiagPrefix = Pick<QualcommDiagHeader, "packetLength" | "logCode">;

export const QUALCOMM_DIAG_PREFIX_BYTES = 4;
export const QUALCOMM_DIAG_HEADER_BYTES = 12;

export function readDiagPrefix(payload: Uint8Array): QualcommDiagPrefix | null {
  if (payload.byteLength < QUALCOMM_DIAG_PREFIX_BYTES) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { packetLength: view.getUint16(0, true), logCode: view.getUint16(2, true) };
}

export function readDiagHeader(payload: Uint8Array, maximumBytes: number, parsedPrefix?: QualcommDiagPrefix): QualcommDiagHeader | null {
  if (payload.byteLength < QUALCOMM_DIAG_HEADER_BYTES) return null;
  const encodedPrefix = readDiagPrefix(payload);
  if (
    encodedPrefix === null ||
    (parsedPrefix !== undefined && (parsedPrefix.packetLength !== encodedPrefix.packetLength || parsedPrefix.logCode !== encodedPrefix.logCode))
  )
    return null;
  const prefix = parsedPrefix ?? encodedPrefix;
  if (prefix.packetLength < QUALCOMM_DIAG_HEADER_BYTES || prefix.packetLength > payload.byteLength || prefix.packetLength > maximumBytes) return null;
  return { ...prefix, view: new DataView(payload.buffer, payload.byteOffset, prefix.packetLength) };
}
