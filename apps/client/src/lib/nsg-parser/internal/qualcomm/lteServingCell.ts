import { type QualcommDiagHeader, readDiagHeader } from "./diag";

export const QUALCOMM_LTE_SERVING_CELL_INFO_LOG_CODE = 0xb0c2;
export const MAX_QUALCOMM_LTE_SERVING_CELL_INFO_BYTES = 64;

const LTE_SERVING_CELL_INFO_BYTES = 41;
const LTE_SERVING_CELL_INFO_VERSION = 3;

export type QualcommLteServingCellInfo = Readonly<{
  version: number;
  pci: number;
  earfcn: number;
  ulEarfcn: number;
  cellIdentity: number;
  tac: number;
  band: number;
  mcc: string;
  mnc: string;
}>;

export function decodeQualcommLteServingCellInfo(payload: Uint8Array, parsedHeader?: QualcommDiagHeader): QualcommLteServingCellInfo | null {
  const header = parsedHeader ?? readDiagHeader(payload, MAX_QUALCOMM_LTE_SERVING_CELL_INFO_BYTES);
  if (
    header === null ||
    header.logCode !== QUALCOMM_LTE_SERVING_CELL_INFO_LOG_CODE ||
    header.packetLength < LTE_SERVING_CELL_INFO_BYTES ||
    header.packetLength > MAX_QUALCOMM_LTE_SERVING_CELL_INFO_BYTES ||
    header.view.byteLength < LTE_SERVING_CELL_INFO_BYTES
  )
    return null;

  const { view } = header;
  const version = view.getUint8(12);
  if (version !== LTE_SERVING_CELL_INFO_VERSION) return null;

  const mncDigitCount = view.getUint8(37);
  if (mncDigitCount !== 2 && mncDigitCount !== 3) return null;
  const mccValue = view.getUint16(35, true);
  if (mccValue >= 1000) return null;
  const mncValue = view.getUint16(38, true);
  if (mncValue >= 10 ** mncDigitCount) return null;

  return {
    version,
    pci: view.getUint16(13, true),
    earfcn: view.getUint32(15, true),
    ulEarfcn: view.getUint32(19, true),
    cellIdentity: view.getUint32(25, true),
    tac: view.getUint16(29, true),
    band: view.getUint32(31, true),
    mcc: String(mccValue).padStart(3, "0"),
    mnc: String(mncValue).padStart(mncDigitCount, "0"),
  };
}
