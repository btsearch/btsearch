import { extraIdentificators, stations } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm/sql/expressions/conditions";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import { type ImportAuditEntry, recordImportAudit } from "../audit.js";
import { DATABASE_STATEMENT_BATCH_SIZE } from "../database-batching.js";
import { db } from "../database.js";
import { chunk, createLogger } from "../utils.js";

const logger = createLogger("device-registry");

const extraIdentifierSelectSchema = createSelectSchema(extraIdentificators);
type ExtraIdentifierRow = z.infer<typeof extraIdentifierSelectSchema>;

async function findMatchingStations(stationIds: string[], operatorId: number): Promise<{ id: number; station_id: string }[]> {
  const matchingStations: { id: number; station_id: string }[] = [];

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

async function loadExistingExtraIdentifiers(stationIds: number[]): Promise<ExtraIdentifierRow[]> {
  const existing: ExtraIdentifierRow[] = [];

  for (const stationIdGroup of chunk(stationIds, DATABASE_STATEMENT_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- sequential chunks bound query size and database load
    const rows = await db.select().from(extraIdentificators).where(inArray(extraIdentificators.station_id, stationIdGroup));
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
  const updates: { row: ExtraIdentifierRow; mnoName: string }[] = [];

  for (const value of toInsert) {
    const existingRow = existingByStationId.get(value.station_id);
    if (!existingRow) toInsertNew.push(value);
    else if (existingRow.mno_name !== value.mno_name) updates.push({ row: existingRow, mnoName: value.mno_name });
  }

  if (updates.length === 0 && toInsertNew.length === 0) {
    logger.log("mno_name entries are already up to date");
    return;
  }

  await db.transaction(async (tx) => {
    const auditEntries: ImportAuditEntry[] = [];

    for (const { row, mnoName } of updates) {
      // oxlint-disable-next-line no-await-in-loop -- updates share the transaction's connection
      const [saved] = await tx
        .update(extraIdentificators)
        .set({ mno_name: mnoName, updatedAt: new Date() })
        .where(eq(extraIdentificators.id, row.id))
        .returning();
      if (saved)
        auditEntries.push({ entity: "extra_identificators", op: "update", recordId: saved.id, stationId: saved.station_id, old: row, new: saved });
    }

    for (const group of chunk(toInsertNew, DATABASE_STATEMENT_BATCH_SIZE)) {
      // oxlint-disable-next-line no-await-in-loop -- insert batches preserve the existing database write order
      const inserted = await tx.insert(extraIdentificators).values(group).returning();
      for (const row of inserted)
        auditEntries.push({ entity: "extra_identificators", op: "create", recordId: row.id, stationId: row.station_id, new: row });
    }

    await recordImportAudit(tx, { dataset: "device_registry", operator_id: operatorId }, auditEntries);
  });

  logger.log(`Synced mno_name: ${toInsertNew.length} inserted, ${updates.length} updated`);
}
