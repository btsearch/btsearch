// oxlint-disable no-await-in-loop -- every statement runs on the release's transaction, one after another
import { extraIdentificators, stations } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import type { PublishedSiteName, SiteNameSyncContext, SiteNameSyncResult, SourceAuditEntry, SourceTransaction } from "../../../../core/sources.ts";
import { chunk } from "../shared/collections.ts";

const STATEMENT_BATCH_SIZE = 500;

const extraIdentifierSelectSchema = createSelectSchema(extraIdentificators);
type ExtraIdentifierRow = z.infer<typeof extraIdentifierSelectSchema>;

type MatchingStation = { id: number; station_id: string };
type StationNamePlan = {
  inserts: { station_id: number; mno_name: string }[];
  updates: { row: ExtraIdentifierRow; mnoName: string }[];
  skippedCount: number;
};

export function siteNamesByOperator(siteNames: readonly PublishedSiteName[]): Map<number, Map<string, string>> {
  const byOperator = new Map<number, Map<string, string>>();
  for (const { operatorId, siteId, name } of siteNames) {
    const nameBySiteId = byOperator.get(operatorId);
    if (nameBySiteId) nameBySiteId.set(siteId, name);
    else byOperator.set(operatorId, new Map([[siteId, name]]));
  }

  return byOperator;
}

export function planStationNames(
  nameBySiteId: ReadonlyMap<string, string>,
  matchingStations: readonly MatchingStation[],
  existingRows: readonly ExtraIdentifierRow[],
): StationNamePlan {
  const existingByStationId = new Map(existingRows.map((row) => [row.station_id, row]));
  const plan: StationNamePlan = { inserts: [], updates: [], skippedCount: 0 };

  for (const station of matchingStations) {
    const name = nameBySiteId.get(station.station_id);
    if (name === undefined) continue;

    const fitsNameColumn = extraIdentifierSelectSchema.shape.mno_name.safeParse(name).success;
    if (!fitsNameColumn) {
      plan.skippedCount += 1;
      continue;
    }

    const existingRow = existingByStationId.get(station.id);
    if (!existingRow) plan.inserts.push({ station_id: station.id, mno_name: name });
    else if (existingRow.mno_name !== name) plan.updates.push({ row: existingRow, mnoName: name });
  }

  return plan;
}

async function findMatchingStations(tx: SourceTransaction, siteIds: readonly string[], operatorId: number): Promise<MatchingStation[]> {
  const matchingStations: MatchingStation[] = [];
  for (const siteIdGroup of chunk(siteIds, STATEMENT_BATCH_SIZE)) {
    const rows = await tx
      .select({ id: stations.id, station_id: stations.station_id })
      .from(stations)
      .where(and(inArray(stations.station_id, siteIdGroup), eq(stations.operator_id, operatorId)));
    matchingStations.push(...rows);
  }

  return matchingStations;
}

async function loadExistingExtraIdentifiers(tx: SourceTransaction, stationIds: readonly number[]): Promise<ExtraIdentifierRow[]> {
  const existingRows: ExtraIdentifierRow[] = [];
  for (const stationIdGroup of chunk(stationIds, STATEMENT_BATCH_SIZE)) {
    const rows = await tx.select().from(extraIdentificators).where(inArray(extraIdentificators.station_id, stationIdGroup));
    existingRows.push(...rows);
  }

  return existingRows;
}

async function syncOperatorStationNames(ctx: SiteNameSyncContext, operatorId: number, nameBySiteId: ReadonlyMap<string, string>): Promise<number> {
  const matchingStations = await findMatchingStations(ctx.tx, [...nameBySiteId.keys()], operatorId);
  if (matchingStations.length === 0) return 0;

  const existingRows = await loadExistingExtraIdentifiers(
    ctx.tx,
    matchingStations.map((station) => station.id),
  );
  const plan = planStationNames(nameBySiteId, matchingStations, existingRows);
  const entries: SourceAuditEntry[] = [];

  for (const { row, mnoName } of plan.updates) {
    const [saved] = await ctx.tx
      .update(extraIdentificators)
      .set({ mno_name: mnoName, updatedAt: new Date() })
      .where(eq(extraIdentificators.id, row.id))
      .returning();
    if (saved) entries.push({ entity: "extra_identificators", op: "update", recordId: saved.id, stationId: saved.station_id, old: row, new: saved });
  }

  for (const insertGroup of chunk(plan.inserts, STATEMENT_BATCH_SIZE)) {
    const inserted = await ctx.tx.insert(extraIdentificators).values(insertGroup).returning();
    for (const row of inserted) entries.push({ entity: "extra_identificators", op: "create", recordId: row.id, stationId: row.station_id, new: row });
  }

  if (entries.length > 0) await ctx.audit({ kind: "official.import", metadata: { dataset: "device_registry", operator_id: operatorId } }, entries);
  return plan.skippedCount;
}

export async function syncStationNames(ctx: SiteNameSyncContext): Promise<SiteNameSyncResult> {
  let skippedSiteNames = 0;
  for (const [operatorId, nameBySiteId] of siteNamesByOperator(ctx.siteNames)) {
    skippedSiteNames += await syncOperatorStationNames(ctx, operatorId, nameBySiteId);
  }

  return { skippedSiteNames };
}
