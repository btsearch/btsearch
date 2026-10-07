import type { TFunction } from "i18next";

import type { Cell, Sector } from "../types";

export type SectorInfo = { id: number; label: string; azimuth: number | null };
export type SectorIndex = ReadonlyMap<number, SectorInfo>;

const SECTOR_LABEL_PREFIX = "A";

export function formatSectorAzimuth(azimuth: number | null, t: TFunction): string {
  return azimuth === null ? t("stationDetails:sectors.omnidirectional") : `${azimuth}°`;
}

export function listSectorInfo(sectors: readonly Sector[]): SectorInfo[] {
  return sectors.map((sector, position) => ({ id: sector.id, label: `${SECTOR_LABEL_PREFIX}${position + 1}`, azimuth: sector.azimuth }));
}

export function indexSectorInfo(sectors: readonly Sector[]): Map<number, SectorInfo> {
  return new Map(listSectorInfo(sectors).map((sector) => [sector.id, sector]));
}

export function findCellSector(cell: Cell, sectorsById: SectorIndex): SectorInfo | null {
  if (cell.sectorId === null) return null;
  return sectorsById.get(cell.sectorId) ?? null;
}
