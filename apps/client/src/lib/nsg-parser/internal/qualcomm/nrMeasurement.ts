import { hasByteRange } from "../binary";
import { type QualcommDiagHeader, readDiagHeader } from "./diag";

export const QUALCOMM_NR_MEASUREMENT_LOG_CODE = 0xb97f;
export const MAX_QUALCOMM_NR_MEASUREMENT_BYTES = 0xffff;

const VERSION_HEADER_BYTES = 16;
const CELL_BYTES = 16;

type QualcommNrLayout = Readonly<{
  measurementHeaderBytes: number;
  layerCountOffset: number;
  carrierBytes: number;
  ccIdOffset: number | null;
  cellCountOffset: number;
  servingIndexOffset: number;
  servingSsbOffset: number;
  beamBytes: number;
  beamCountBytes: 1 | 4;
  servingIdentity: "index" | "pci";
}>;

const LEGACY_CARRIER_LAYOUT = {
  carrierBytes: 32,
  ccIdOffset: null,
  cellCountOffset: 4,
  servingIndexOffset: 5,
  servingSsbOffset: 8,
} as const;
const MODERN_CARRIER_LAYOUT = {
  carrierBytes: 32,
  ccIdOffset: 4,
  cellCountOffset: 5,
  servingIndexOffset: 8,
  servingSsbOffset: 9,
} as const;

const QUALCOMM_NR_LAYOUTS: ReadonlyMap<string, QualcommNrLayout> = new Map([
  ["2.6", { ...LEGACY_CARRIER_LAYOUT, measurementHeaderBytes: 20, layerCountOffset: 16, beamBytes: 44, beamCountBytes: 1, servingIdentity: "index" }],
  ["2.7", { ...LEGACY_CARRIER_LAYOUT, measurementHeaderBytes: 28, layerCountOffset: 16, beamBytes: 44, beamCountBytes: 1, servingIdentity: "index" }],
  ["2.9", { ...MODERN_CARRIER_LAYOUT, measurementHeaderBytes: 32, layerCountOffset: 20, beamBytes: 44, beamCountBytes: 1, servingIdentity: "index" }],
  [
    "2.10",
    { ...MODERN_CARRIER_LAYOUT, measurementHeaderBytes: 32, layerCountOffset: 20, beamBytes: 84, beamCountBytes: 4, servingIdentity: "index" },
  ],
  [
    "3.0",
    {
      ...MODERN_CARRIER_LAYOUT,
      carrierBytes: 40,
      measurementHeaderBytes: 32,
      layerCountOffset: 20,
      beamBytes: 84,
      beamCountBytes: 4,
      servingIdentity: "pci",
    },
  ],
]);

export type QualcommNrMeasurementCell = Readonly<{
  carrierIndex: number;
  cellIndex: number;
  arfcn: number;
  ccId: number | null;
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

function layoutForVersion(versionMajor: number, versionMinor: number): QualcommNrLayout | null {
  return QUALCOMM_NR_LAYOUTS.get(`${versionMajor}.${versionMinor}`) ?? null;
}

function servingCellIndex(
  layout: QualcommNrLayout,
  cells: readonly QualcommNrMeasurementCell[],
  servingIndex: number,
  servingPci: number,
): number | null {
  if (layout.servingIdentity === "index") return servingIndex < cells.length ? servingIndex : null;
  if (servingPci === 0xffff) return null;
  let match: number | null = null;
  for (let index = 0; index < cells.length; index++) {
    if (cells[index].pci !== servingPci) continue;
    if (match !== null) return null;
    match = index;
  }
  return match;
}

export function decodeQualcommNrMeasurement(payload: Uint8Array, parsedHeader?: QualcommDiagHeader): QualcommNrMeasurement | null {
  const header = parsedHeader ?? readDiagHeader(payload, MAX_QUALCOMM_NR_MEASUREMENT_BYTES);
  if (header === null || header.packetLength < VERSION_HEADER_BYTES || header.logCode !== QUALCOMM_NR_MEASUREMENT_LOG_CODE) return null;
  const { packetLength, view } = header;

  const versionMinor = view.getUint16(12, true);
  const versionMajor = view.getUint16(14, true);
  const layout = layoutForVersion(versionMajor, versionMinor);
  if (layout === null || packetLength < layout.measurementHeaderBytes) return null;

  const layerCount = view.getUint8(layout.layerCountOffset);
  const cells: QualcommNrMeasurementCell[] = [];
  let offset = layout.measurementHeaderBytes;

  for (let carrierIndex = 0; carrierIndex < layerCount; carrierIndex++) {
    if (!hasByteRange(offset, layout.carrierBytes, packetLength)) return null;
    const arfcn = view.getUint32(offset, true);
    const ccId = layout.ccIdOffset === null ? null : view.getUint8(offset + layout.ccIdOffset);
    const cellCount = view.getUint8(offset + layout.cellCountOffset);
    const servingPci = view.getUint16(offset + 6, true);
    const servingIndex = view.getUint8(offset + layout.servingIndexOffset);
    const servingSsb = view.getUint8(offset + layout.servingSsbOffset);
    offset += layout.carrierBytes;
    const carrierCells: QualcommNrMeasurementCell[] = [];

    for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
      if (!hasByteRange(offset, CELL_BYTES, packetLength)) return null;
      const pci = view.getUint16(offset, true);
      const sfn = view.getUint16(offset + 2, true);
      const beamCount = layout.beamCountBytes === 1 ? view.getUint8(offset + 4) : view.getUint32(offset + 4, true);
      if (beamCount > Math.floor((packetLength - offset - CELL_BYTES) / layout.beamBytes)) return null;
      const cellLength = CELL_BYTES + beamCount * layout.beamBytes;
      if (!hasByteRange(offset, cellLength, packetLength)) return null;

      carrierCells.push({
        carrierIndex,
        cellIndex,
        arfcn,
        ccId,
        pci,
        sfn,
        beamCount,
        rsrp: view.getInt32(offset + 8, true) / 128,
        rsrq: view.getInt32(offset + 12, true) / 128,
        serving: false,
        servingPci,
        servingSsb,
      });
      offset += cellLength;
    }
    const resolvedServingIndex = servingCellIndex(layout, carrierCells, servingIndex, servingPci);
    if (resolvedServingIndex !== null) carrierCells[resolvedServingIndex] = { ...carrierCells[resolvedServingIndex], serving: true };
    cells.push(...carrierCells);
  }

  for (; offset < packetLength; offset++) if (payload[offset] !== 0) return null;

  return { packetLength, versionMajor, versionMinor, layerCount, cells };
}
