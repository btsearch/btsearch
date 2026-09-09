import { type QualcommDiagHeader, readDiagHeader } from "./diag";

export const QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE = 0xb823;
export const QUALCOMM_NR_SERVING_CELL_INFO_BYTES = 50;
export const MAX_QUALCOMM_NR_SERVING_CELL_INFO_BYTES = QUALCOMM_NR_SERVING_CELL_INFO_BYTES;

const SUPPORTED_VERSION = 4;

export type QualcommNrServingCellInfo = Readonly<{
  packetLength: number;
  version: number;
  physicalCellId: number;
  downlinkFrequency: number;
  uplinkFrequency: number;
  downlinkBandwidth: number;
  uplinkBandwidth: number;
  cellIdentity: bigint;
  mcc: number;
  mncDigitCount: number;
  mnc: number;
  allowedAccess: number;
  tac: number;
  band: number;
}>;

export function decodeQualcommNrServingCellInfo(payload: Uint8Array, parsedHeader?: QualcommDiagHeader): QualcommNrServingCellInfo | null {
  const header = parsedHeader ?? readDiagHeader(payload, MAX_QUALCOMM_NR_SERVING_CELL_INFO_BYTES);
  if (
    header === null ||
    header.logCode !== QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE ||
    header.packetLength !== QUALCOMM_NR_SERVING_CELL_INFO_BYTES ||
    header.view.getUint32(12, true) !== SUPPORTED_VERSION
  )
    return null;
  const { packetLength, view } = header;
  return {
    packetLength,
    version: SUPPORTED_VERSION,
    physicalCellId: view.getUint16(16, true),
    downlinkFrequency: view.getUint32(18, true),
    uplinkFrequency: view.getUint32(22, true),
    downlinkBandwidth: view.getUint16(26, true),
    uplinkBandwidth: view.getUint16(28, true),
    cellIdentity: view.getBigUint64(30, true),
    mcc: view.getUint16(38, true),
    mncDigitCount: view.getUint8(40),
    mnc: view.getUint8(41),
    allowedAccess: view.getUint8(42),
    tac: view.getUint32(44, true),
    band: view.getUint16(48, true),
  };
}
