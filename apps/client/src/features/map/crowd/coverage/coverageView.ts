import type { Band, ObservedCellRecord } from "@openbts/shared/contract";

import type { MeasuredCoverage, MeasuredCoverageBandId, MeasuredCoverageTarget } from "./coverageStore";
import { describeObservedCellNumber, readObservedCellPci } from "./observedCells";

export type MeasuredCoverageCell = {
  record: ObservedCellRecord;
  label: string;
  colorIndex: number;
  bearingDegrees: number | null;
  sectorAzimuth: number | null;
  isOutsideDatabase: boolean;
};

export type MeasuredCoverageBand = {
  bandId: MeasuredCoverageBandId;
  band: Band | undefined;
  cells: MeasuredCoverageCell[];
};

export type MeasuredCoverageView = {
  bands: MeasuredCoverageBand[];
  band: MeasuredCoverageBand | null;
  chosenCell: MeasuredCoverageCell | null;
};

const ESTIMATED_SECTOR_PREFIX = "A";
const UNLABELLED_BAND_MHZ = Number.POSITIVE_INFINITY;

function compareByBearing(left: ObservedCellRecord, right: ObservedCellRecord): number {
  const leftBearing = left.geometry?.bearingDegrees ?? Number.POSITIVE_INFINITY;
  const rightBearing = right.geometry?.bearingDegrees ?? Number.POSITIVE_INFINITY;
  return leftBearing - rightBearing || left.id - right.id;
}

function labelCell(record: ObservedCellRecord, sectorLabel: string | null): string {
  const pci = readObservedCellPci(record);
  const parts = [sectorLabel, pci === null ? null : `PCI ${pci}`].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(", ") : describeObservedCellNumber(record);
}

function toCoverageCell(record: ObservedCellRecord, index: number, target: MeasuredCoverageTarget): MeasuredCoverageCell {
  const sector = target.kind === "station" && record.matchedCellId !== null ? (target.sectorsByCellId.get(record.matchedCellId) ?? null) : null;
  const sectorLabel = target.kind === "estimatedSite" ? `${ESTIMATED_SECTOR_PREFIX}${index + 1}` : (sector?.label ?? null);

  return {
    record,
    label: labelCell(record, sectorLabel),
    colorIndex: index,
    bearingDegrees: record.geometry?.bearingDegrees ?? null,
    sectorAzimuth: sector?.azimuth ?? null,
    isOutsideDatabase: target.kind === "station" && record.matchedCellId === null,
  };
}

function getBandMhz(band: Band | undefined): number {
  return band?.labelMhz ?? UNLABELLED_BAND_MHZ;
}

export function listCoverageBands(
  records: readonly ObservedCellRecord[],
  target: MeasuredCoverageTarget,
  bandsById: ReadonlyMap<number, Band>,
): MeasuredCoverageBand[] {
  const recordsByBand = new Map<MeasuredCoverageBandId, ObservedCellRecord[]>();
  for (const record of records) {
    const bandRecords = recordsByBand.get(record.bandId) ?? [];
    bandRecords.push(record);
    recordsByBand.set(record.bandId, bandRecords);
  }

  return [...recordsByBand]
    .map(([bandId, bandRecords]) => ({
      bandId,
      band: bandId === null ? undefined : bandsById.get(bandId),
      cells: bandRecords.sort(compareByBearing).map((record, index) => toCoverageCell(record, index, target)),
    }))
    .sort((left, right) => getBandMhz(left.band) - getBandMhz(right.band) || (left.bandId ?? 0) - (right.bandId ?? 0));
}

export function readCoverageView(bands: MeasuredCoverageBand[], coverage: MeasuredCoverage): MeasuredCoverageView {
  const band = bands.find((entry) => entry.bandId === coverage.bandId) ?? bands.at(0) ?? null;
  const chosenCell = band?.cells.find((cell) => cell.record.id === coverage.observedCellId) ?? null;
  return { bands, band, chosenCell };
}
