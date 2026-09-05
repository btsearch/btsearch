import { type QualcommDiagHeader, readDiagHeader } from "./qualcommDiag";

export const QUALCOMM_NR_MEASUREMENT_LOG_CODE = 0xb97f;
export const MAX_QUALCOMM_NR_MEASUREMENT_BYTES = 0xffff;

const MEASUREMENT_HEADER_BYTES = 32;
const CARRIER_BYTES = 32;
const CELL_BYTES = 16;
const BEAM_BYTES = 44;
const VERSION_MINOR = 9;
const VERSION_MAJOR = 2;

export type QualcommNrMeasurementCell = Readonly<{
  carrierIndex: number;
  cellIndex: number;
  arfcn: number;
  ccId: number;
  pci: number;
  sfn: number;
  beamCount: number;
  rsrp: number;
  rsrq: number;
  serving: boolean;
  servingPci: number;
  servingSsb: number;
}>;

export type QualcommNrMeasurement = Readonly<{
  packetLength: number;
  versionMajor: number;
  versionMinor: number;
  layerCount: number;
  cells: readonly QualcommNrMeasurementCell[];
}>;

function hasBytes(offset: number, size: number, limit: number): boolean {
  return offset >= 0 && size >= 0 && offset <= limit - size;
}

export function decodeQualcommNrMeasurement(payload: Uint8Array, parsedHeader?: QualcommDiagHeader): QualcommNrMeasurement | null {
  const header = parsedHeader ?? readDiagHeader(payload, MAX_QUALCOMM_NR_MEASUREMENT_BYTES);
  if (header === null || header.packetLength < MEASUREMENT_HEADER_BYTES || header.logCode !== QUALCOMM_NR_MEASUREMENT_LOG_CODE) return null;
  const { packetLength, view } = header;

  const versionMinor = view.getUint16(12, true);
  const versionMajor = view.getUint16(14, true);
  if (versionMinor !== VERSION_MINOR || versionMajor !== VERSION_MAJOR) return null;

  const layerCount = view.getUint8(20);
  const cells: QualcommNrMeasurementCell[] = [];
  let offset = MEASUREMENT_HEADER_BYTES;

  for (let carrierIndex = 0; carrierIndex < layerCount; carrierIndex++) {
    if (!hasBytes(offset, CARRIER_BYTES, packetLength)) return null;
    const arfcn = view.getUint32(offset, true);
    const ccId = view.getUint8(offset + 4);
    const cellCount = view.getUint8(offset + 5);
    const servingPci = view.getUint16(offset + 6, true);
    const servingIndex = view.getUint8(offset + 8);
    const servingSsb = view.getUint8(offset + 9);
    const hasServingIndex = servingIndex < cellCount;
    offset += CARRIER_BYTES;

    for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
      if (!hasBytes(offset, CELL_BYTES, packetLength)) return null;
      const pci = view.getUint16(offset, true);
      const sfn = view.getUint16(offset + 2, true);
      const beamCount = view.getUint8(offset + 4);
      const cellLength = CELL_BYTES + beamCount * BEAM_BYTES;
      if (!hasBytes(offset, cellLength, packetLength)) return null;

      cells.push({
        carrierIndex,
        cellIndex,
        arfcn,
        ccId,
        pci,
        sfn,
        beamCount,
        rsrp: view.getInt32(offset + 8, true) / 128,
        rsrq: view.getInt32(offset + 12, true) / 128,
        serving: hasServingIndex && cellIndex === servingIndex,
        servingPci,
        servingSsb,
      });
      offset += cellLength;
    }
  }

  for (; offset < packetLength; offset++) if (payload[offset] !== 0) return null;

  return { packetLength, versionMajor, versionMinor, layerCount, cells };
}
