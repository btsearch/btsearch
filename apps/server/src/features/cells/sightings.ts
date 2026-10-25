import { cellMatches, cells, curatedCellSummaries, observedCellSummaries } from "@openbts/drizzle";
import type { CellSightings, StationSightings } from "@openbts/shared/contract";
import { type SQL, eq, inArray, max, min, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import type { CellRow } from "../stations/serialize.js";

const FIXED_WIDTH_RATS = new Set<CellRow["rat"]>(["GSM", "UMTS"]);

async function findCellSightings(condition: SQL): Promise<Map<number, CellSightings>> {
  const rows = await db
    .select({
      cellId: curatedCellSummaries.cellId,
      rat: cells.rat,
      firstSeenOn: curatedCellSummaries.firstSeenOn,
      lastSeenOn: curatedCellSummaries.lastSeenOn,
      bandwidthKhz: curatedCellSummaries.bandwidthKhz,
    })
    .from(curatedCellSummaries)
    .innerJoin(cells, eq(cells.id, curatedCellSummaries.cellId))
    .where(condition);
  return new Map(
    rows.map(({ cellId, rat, firstSeenOn, lastSeenOn, bandwidthKhz }) => [
      cellId,
      { firstSeenOn, lastSeenOn, bandwidthKhz: FIXED_WIDTH_RATS.has(rat) ? null : bandwidthKhz },
    ]),
  );
}

export async function loadCellSightings(cellIds: readonly number[]): Promise<Map<number, CellSightings>> {
  return cellIds.length === 0 ? new Map() : findCellSightings(inArray(curatedCellSummaries.cellId, [...cellIds]));
}

export async function loadStationCellSightings(stationIds: readonly number[]): Promise<Map<number, CellSightings>> {
  return stationIds.length === 0 ? new Map() : findCellSightings(inArray(cells.station_id, [...stationIds]));
}

export async function loadStationSightings(stationIds: readonly number[]): Promise<Map<number, StationSightings>> {
  if (stationIds.length === 0) return new Map();

  const ofCells = db
    .select({ stationId: cells.station_id, firstSeenOn: curatedCellSummaries.firstSeenOn, lastSeenOn: curatedCellSummaries.lastSeenOn })
    .from(curatedCellSummaries)
    .innerJoin(cells, eq(cells.id, curatedCellSummaries.cellId))
    .where(inArray(cells.station_id, [...stationIds]));
  const ofStationOnlyMatches = db
    .select({
      stationId: sql<number>`${cellMatches.stationId}`.as("station_id"),
      firstSeenOn: observedCellSummaries.firstSeenOn,
      lastSeenOn: observedCellSummaries.lastSeenOn,
    })
    .from(cellMatches)
    .innerJoin(observedCellSummaries, eq(observedCellSummaries.observedCellId, cellMatches.observedCellId))
    .where(inArray(cellMatches.stationId, [...stationIds]));
  const seen = ofCells.unionAll(ofStationOnlyMatches).as("seen");
  const rows = await db
    .select({ stationId: seen.stationId, firstSeenOn: min(seen.firstSeenOn), lastSeenOn: max(seen.lastSeenOn) })
    .from(seen)
    .groupBy(seen.stationId);
  return new Map(
    rows.flatMap(({ stationId, firstSeenOn, lastSeenOn }): [number, StationSightings][] =>
      firstSeenOn === null || lastSeenOn === null ? [] : [[stationId, { firstSeenOn, lastSeenOn }]],
    ),
  );
}
