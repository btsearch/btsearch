import { BEARING_DIFFERS_BY_DEGREES, NARROW_SPREAD_DEGREES } from "@openbts/shared/contract";

import type { Sector, StationCell, StationRecord } from "../types";
import { type SectorIndex, findCellSector } from "../utils/sectors";
import { getStationCountryCode, getStationNumber } from "../utils/stations";
import type { MeasuredCompassDirection } from "@/components/cellular/azimuthCompass";
import type { MeasuredCoverageSector, StationCoverageTarget } from "@/features/map/crowd/coverage/coverageStore";
import type { MeasuredCoverageBand, MeasuredCoverageCell } from "@/features/map/crowd/coverage/coverageView";

export type MeasuredBearing = {
  bearingDegrees: number;
  spreadDegrees: number;
  people: number;
  differs: boolean;
};

type BearingShape = {
  bearingDegrees: number;
  spreadDegrees: number;
};

const FULL_TURN_DEGREES = 360;

export function toStationCoverageTarget(station: StationRecord, sectorsById: SectorIndex): StationCoverageTarget | null {
  if (station.location === null) return null;

  const sectorsByCellId = new Map<number, MeasuredCoverageSector>();
  for (const cell of station.cells) {
    const sector = findCellSector(cell, sectorsById);
    if (sector !== null) sectorsByCellId.set(cell.id, { label: sector.label, azimuth: sector.azimuth });
  }

  return {
    kind: "station",
    stationId: station.id,
    countryCode: getStationCountryCode(station),
    operatorId: station.operatorId,
    title: getStationNumber(station),
    latitude: station.location.latitude,
    longitude: station.location.longitude,
    sectorsByCellId,
  };
}

export function indexMeasuredCells(bands: readonly MeasuredCoverageBand[]): Map<number, MeasuredCoverageCell> {
  const cellsById = new Map<number, MeasuredCoverageCell>();
  for (const cell of bands.flatMap((band) => band.cells)) {
    const cellId = cell.record.matchedCellId;
    if (cellId === null) continue;
    const known = cellsById.get(cellId);
    if (known === undefined || cell.record.sampleCount > known.record.sampleCount) cellsById.set(cellId, cell);
  }
  return cellsById;
}

function countBandSamples(band: MeasuredCoverageBand): number {
  return band.cells.reduce((sum, cell) => sum + cell.record.sampleCount, 0);
}

export function findBusiestBand(bands: readonly MeasuredCoverageBand[]): MeasuredCoverageBand | undefined {
  let busiest: MeasuredCoverageBand | undefined;
  for (const band of bands) if (busiest === undefined || countBandSamples(band) > countBandSamples(busiest)) busiest = band;
  return busiest;
}

export function doesBearingDiffer(shape: BearingShape, azimuth: number | null): boolean {
  if (azimuth === null || shape.spreadDegrees >= NARROW_SPREAD_DEGREES) return false;
  const difference = Math.abs(shape.bearingDegrees - azimuth) % FULL_TURN_DEGREES;
  return Math.min(difference, FULL_TURN_DEGREES - difference) > BEARING_DIFFERS_BY_DEGREES;
}

export function listSectorBearings(
  sectors: readonly Sector[],
  cells: readonly StationCell[],
  measuredCells: ReadonlyMap<number, MeasuredCoverageCell>,
): Map<number, MeasuredBearing> {
  const azimuths = new Map(sectors.map((sector) => [sector.id, sector.azimuth]));
  const busiest = new Map<number, MeasuredCoverageCell>();
  for (const cell of cells) {
    const measured = measuredCells.get(cell.id);
    if (cell.sectorId === null || measured === undefined || measured.record.geometry === null) continue;
    const known = busiest.get(cell.sectorId);
    if (known === undefined || measured.record.sampleCount > known.record.sampleCount) busiest.set(cell.sectorId, measured);
  }

  const bearings = new Map<number, MeasuredBearing>();
  for (const [sectorId, measured] of busiest) {
    const geometry = measured.record.geometry;
    if (geometry === null) continue;
    bearings.set(sectorId, {
      bearingDegrees: Math.round(geometry.bearingDegrees),
      spreadDegrees: Math.round(geometry.spreadDegrees),
      people: measured.record.personCount,
      differs: doesBearingDiffer(geometry, azimuths.get(sectorId) ?? null),
    });
  }
  return bearings;
}

export function listMeasuredDirections(bearings: ReadonlyMap<number, MeasuredBearing>): MeasuredCompassDirection[] {
  return [...bearings].map(([sectorId, bearing]) => ({ id: sectorId, bearing: bearing.bearingDegrees, spread: bearing.spreadDegrees }));
}
