import { cellMatches, cellShapes, cells, observationFlags, observedCellSummaries, observedCells, stationSectors } from "@openbts/drizzle";
import { BEARING_DIFFERS_BY_DEGREES, NARROW_SPREAD_DEGREES } from "@openbts/shared/contract";
import { type SQL, and, desc, eq, exists, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import db from "../../../../database/psql.js";
import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { toAzimuth } from "../../../stations/serialize.js";
import type { RaisedFlag } from "../kinds.js";
import { sectorSubject } from "../subjects.js";
import { type FlagSyncCounts, NOTHING_SYNCED, syncFlags } from "../sync.js";

export type SectorCell = {
  sectorId: number;
  azimuth: number;
  stationId: number;
  cellId: number;
  observedCellId: number;
  observedSiteId: number | null;
  samples: number;
  people: number;
  bearingDeg: number;
  spreadDeg: number;
};

function aroundTheCircle(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

function toTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

export function raiseBearingFlags(cells: readonly SectorCell[], sitesOffTheirStation: ReadonlySet<number>): RaisedFlag<"bearingDiffers">[] {
  return [...Map.groupBy(cells, (cell) => cell.sectorId)].flatMap(([sectorId, sectorCells]): RaisedFlag<"bearingDiffers">[] => {
    const [decides] = sectorCells.toSorted((a, b) => b.samples - a.samples || a.observedCellId - b.observedCellId);
    const azimuth = decides === undefined ? null : toAzimuth(decides.azimuth);
    if (decides === undefined || azimuth === null || decides.spreadDeg >= NARROW_SPREAD_DEGREES) return [];
    if (aroundTheCircle(decides.bearingDeg, azimuth) <= BEARING_DIFFERS_BY_DEGREES) return [];
    if (decides.observedSiteId !== null && sitesOffTheirStation.has(decides.observedSiteId)) return [];

    const { stationId, cellId, observedCellId, observedSiteId } = decides;
    return [
      {
        kind: "bearingDiffers",
        subjectKey: sectorSubject(sectorId),
        refs: { sectorId, stationId, cellId, observedCellId, observedSiteId },
        evidence: { bearingDegrees: toTenths(decides.bearingDeg), spreadDegrees: toTenths(decides.spreadDeg), azimuth },
        suggestion: null,
        measure: { azimuth, people: decides.people },
      },
    ];
  });
}

async function findSectorsOf(tx: DbTx, siteIds: readonly number[]): Promise<number[]> {
  const [matched, flagged] = await Promise.all([
    tx
      .selectDistinct({ sectorId: cells.sector_id })
      .from(cellMatches)
      .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
      .innerJoin(cells, eq(cells.id, cellMatches.cellId))
      .where(and(inArray(observedCells.observedSiteId, [...siteIds]), eq(cellMatches.kind, "cell"), isNotNull(cells.sector_id))),
    tx
      .select({ sectorId: observationFlags.sectorId })
      .from(observationFlags)
      .where(
        and(
          isNull(observationFlags.closedReason),
          eq(observationFlags.kind, "bearingDiffers"),
          inArray(observationFlags.observedSiteId, [...siteIds]),
        ),
      ),
  ]);
  return unique([...matched, ...flagged].map((row) => row.sectorId));
}

async function loadSectorCells(tx: DbTx, sectorIds: readonly number[]): Promise<SectorCell[]> {
  if (sectorIds.length === 0) return [];

  const rows = await tx
    .selectDistinctOn([cellMatches.observedCellId], {
      sectorId: stationSectors.id,
      azimuth: stationSectors.azimuth,
      stationId: cells.station_id,
      cellId: cells.id,
      observedCellId: cellMatches.observedCellId,
      observedSiteId: observedCells.observedSiteId,
      samples: observedCellSummaries.sampleCount,
      people: observedCellSummaries.personCount,
      bearingDeg: cellShapes.bearingDeg,
      spreadDeg: cellShapes.spreadDeg,
    })
    .from(cellMatches)
    .innerJoin(cells, eq(cells.id, cellMatches.cellId))
    .innerJoin(stationSectors, eq(stationSectors.id, cells.sector_id))
    .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
    .innerJoin(cellShapes, eq(cellShapes.observedCellId, cellMatches.observedCellId))
    .leftJoin(observedCellSummaries, eq(observedCellSummaries.observedCellId, cellMatches.observedCellId))
    .where(and(inArray(cells.sector_id, [...sectorIds]), eq(cellMatches.kind, "cell")))
    .orderBy(cellMatches.observedCellId, desc(cellShapes.shapeVersion));
  return rows.map(({ samples, people, ...cell }) => ({ ...cell, samples: samples ?? 0, people: people ?? 0 }));
}

async function findSitesOffTheirStation(tx: DbTx, siteIds: readonly number[]): Promise<Set<number>> {
  if (siteIds.length === 0) return new Set();

  const rows = await tx
    .select({ observedSiteId: observationFlags.observedSiteId })
    .from(observationFlags)
    .where(
      and(
        isNull(observationFlags.closedReason),
        eq(observationFlags.kind, "positionDiffers"),
        inArray(observationFlags.observedSiteId, [...siteIds]),
      ),
    );
  return new Set(unique(rows.map((row) => row.observedSiteId)));
}

function bearingSettledByEditor(): SQL | undefined {
  const azimuthEdited = db
    .select({ id: stationSectors.id })
    .from(stationSectors)
    .where(
      and(eq(stationSectors.id, observationFlags.sectorId), ne(stationSectors.azimuth, sql`(${observationFlags.evidence}->>'azimuth')::integer`)),
    );
  const cellMoved = db
    .select({ id: cells.id })
    .from(cells)
    .where(and(eq(cells.id, observationFlags.cellId), or(isNull(cells.sector_id), ne(cells.sector_id, observationFlags.sectorId))));
  return or(exists(azimuthEdited), exists(cellMoved));
}

export async function syncBearingFlags(tx: DbTx, siteIds: readonly number[], resolvedById: string | null): Promise<FlagSyncCounts> {
  const sectorIds = await findSectorsOf(tx, siteIds);
  if (sectorIds.length === 0) return NOTHING_SYNCED;

  const sectorCells = await loadSectorCells(tx, sectorIds);
  const offTheirStation = await findSitesOffTheirStation(tx, unique(sectorCells.map((cell) => cell.observedSiteId)));
  const raised = raiseBearingFlags(sectorCells, offTheirStation);
  return syncFlags(tx, {
    kinds: ["bearingDiffers"],
    lookedAt: inArray(observationFlags.sectorId, sectorIds),
    raised,
    fixed: bearingSettledByEditor(),
    resolvedById,
  });
}
