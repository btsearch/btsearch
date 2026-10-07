import type { Cell, Sector } from "../../types";
import { getBandCode, getBandLabel, getBandSortValue, toRatType } from "../../utils/bands";
import { type SectorInfo, findCellSector, indexSectorInfo, listSectorInfo } from "../../utils/sectors";
import { RAT_ORDER, type RatType } from "@/features/shared/rat";

export type SectorBand = { key: string; rat: RatType; label: string | null; code: string | null };
export type SectorBandRow = SectorInfo & { bands: SectorBand[] };

type SectorBandSummary = { rows: SectorBandRow[]; hasLinkedCells: boolean; unlinkedCellCount: number };
type RankedSectorBand = { band: SectorBand; labelMhz: number };

const BAND_KEY_SEPARATOR = "|";

function toRankedSectorBand(cell: Cell, language: string): RankedSectorBand {
  const rat = toRatType(cell.rat);
  const label = getBandLabel(cell.band, language);
  const code = getBandCode(cell.band);
  const key = [rat, label ?? "", code ?? ""].join(BAND_KEY_SEPARATOR);
  return { band: { key, rat, label, code }, labelMhz: getBandSortValue(cell.band) };
}

function compareRankedSectorBands(left: RankedSectorBand, right: RankedSectorBand): number {
  return (
    RAT_ORDER.indexOf(left.band.rat) - RAT_ORDER.indexOf(right.band.rat) ||
    left.labelMhz - right.labelMhz ||
    (left.band.code ?? "").localeCompare(right.band.code ?? "", undefined, { numeric: true }) ||
    left.band.key.localeCompare(right.band.key)
  );
}

function listSectorBands(cells: readonly Cell[], language: string): SectorBand[] {
  const rankedBands = new Map<string, RankedSectorBand>();
  for (const cell of cells) {
    const rankedBand = toRankedSectorBand(cell, language);
    if (!rankedBands.has(rankedBand.band.key)) rankedBands.set(rankedBand.band.key, rankedBand);
  }

  return [...rankedBands.values()].sort(compareRankedSectorBands).map((rankedBand) => rankedBand.band);
}

export function summarizeSectorBands(sectors: readonly Sector[], cells: readonly Cell[], language: string): SectorBandSummary {
  const sectorsById = indexSectorInfo(sectors);
  const unlinkedCellCount = cells.filter((cell) => findCellSector(cell, sectorsById) === null).length;

  return {
    rows: listSectorInfo(sectors).map((sector) => ({
      ...sector,
      bands: listSectorBands(
        cells.filter((cell) => cell.sectorId === sector.id),
        language,
      ),
    })),
    hasLinkedCells: unlinkedCellCount < cells.length,
    unlinkedCellCount,
  };
}
