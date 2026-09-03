import { extraIdentificators, stations } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm/sql/expressions/conditions";

import { DATABASE_STATEMENT_BATCH_SIZE, DATABASE_WRITE_CONCURRENCY, runInConcurrentBatches } from "../database-batching.js";
import { db } from "../database.js";
import { chunk, createLogger } from "../utils.js";

const logger = createLogger("device-registry");

interface MnoNameUpdate {
  id: number;
  mnoName: string;
  updatedAt: Date;
}

async function findMatchingStations(stationIds: string[], operatorId: number): Promise<Array<{ id: number; station_id: string }>> {
  const matchingStations: Array<{ id: number; station_id: string }> = [];

  for (const stationIdGroup of chunk(stationIds, DATABASE_STATEMENT_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- sequential chunks bound query size and database load
    const rows = await db
      .select({ id: stations.id, station_id: stations.station_id })
      .from(stations)
      .where(and(inArray(stations.station_id, stationIdGroup), eq(stations.operator_id, operatorId)));
    matchingStations.push(...rows);
  }

  return matchingStations;
}

async function loadExistingExtraIdentifiers(stationIds: number[]): Promise<Array<{ id: number; station_id: number; mno_name: string | null }>> {
  const existing: Array<{ id: number; station_id: number; mno_name: string | null }> = [];

  for (const stationIdGroup of chunk(stationIds, DATABASE_STATEMENT_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- sequential chunks bound query size and database load
    const rows = await db
      .select({ id: extraIdentificators.id, station_id: extraIdentificators.station_id, mno_name: extraIdentificators.mno_name })
      .from(extraIdentificators)
      .where(inArray(extraIdentificators.station_id, stationIdGroup));
    existing.push(...rows);
  }

  return existing;
}

export async function syncStationMnoNames(stationMnoNames: Map<string, string>, operatorId: number): Promise<void> {
  if (stationMnoNames.size === 0) return;

  logger.log(`Syncing ${stationMnoNames.size} mno_name entries to extra_identificators...`);
  const stationIdStrings = Array.from(stationMnoNames.keys());
  const matchingStations = await findMatchingStations(stationIdStrings, operatorId);

  const toInsert = matchingStations
    .map((station) => ({ station_id: station.id, mno_name: stationMnoNames.get(station.station_id) ?? null }))
    .filter((value): value is { station_id: number; mno_name: string } => value.mno_name !== null);

  if (toInsert.length === 0) return;

  const internalStationIds = toInsert.map((value) => value.station_id);
  const existing = await loadExistingExtraIdentifiers(internalStationIds);

  const existingByStationId = new Map(existing.map((entry) => [entry.station_id, entry]));
  const toInsertNew: typeof toInsert = [];
  const updates: MnoNameUpdate[] = [];

  for (const value of toInsert) {
    const existingRow = existingByStationId.get(value.station_id);
    if (!existingRow) toInsertNew.push(value);
    else if (existingRow.mno_name !== value.mno_name) updates.push({ id: existingRow.id, mnoName: value.mno_name, updatedAt: new Date() });
  }

  await runInConcurrentBatches(updates, DATABASE_WRITE_CONCURRENCY, (update) =>
    db.update(extraIdentificators).set({ mno_name: update.mnoName, updatedAt: update.updatedAt }).where(eq(extraIdentificators.id, update.id)),
  );

  // oxlint-disable-next-line no-await-in-loop -- insert batches preserve the existing database write order
  for (const group of chunk(toInsertNew, DATABASE_STATEMENT_BATCH_SIZE)) await db.insert(extraIdentificators).values(group);
  logger.log(`Synced mno_name: ${toInsertNew.length} inserted, ${toInsert.length - toInsertNew.length} already existed`);
}
