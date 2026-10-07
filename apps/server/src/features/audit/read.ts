import { auditLogs, auditOperations, stations, users } from "@openbts/drizzle";
import type { AuditEntity, AuditOp, AuditOperationKind } from "@openbts/shared/audit";
import type { AuditOperationListQuery, AuditOperationSort, AuditOperationStation } from "@openbts/shared/contract";
import { type SQL, and, asc, count, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import type { Database } from "../../database/psql.js";
import { runLimited } from "../../lib/async/runLimited.js";
import { chunks } from "../../lib/collections.js";
import { type SortColumn, type SortField, createKeyset } from "../../lib/keyset.js";
import type { DbTx } from "../../types/global.js";
import { loadHiddenCountryCodes } from "../countries/visibility.js";
import { containsPattern } from "../search/text.js";
import { stationAreaConditions } from "../stations/read.js";
import type { AuditReach } from "./access.js";
import { toAuditMetadata } from "./metadata.js";
import { getEntryRevertibility, loadRevertedEntryIds } from "./revert/revertibility.js";
import { findRestoringBandEntries } from "./revert/strategies/reference.js";
import type { AuditCount, AuditEntry, AuditOperationRow, AuditOperationSummary, AuditOperationWithEntries, UserSummary } from "./types.js";

type AuditOperationFilters = {
  kinds: AuditOperationKind[];
  entities: AuditEntity[];
  ops: AuditOp[];
  userIds: string[];
  stationIds: number[];
  from?: Date;
  to?: Date;
  query?: string;
  countryCodes?: readonly string[];
};

type CursorPaging = Pick<AuditOperationListQuery, "sort" | "limit" | "cursor" | "offset" | "includeTotal">;

const STATION_IDS_PER_QUERY = 5000;
const SORT_COLUMNS: Record<SortField<AuditOperationSort>, SortColumn | null> = {
  createdAt: { column: auditOperations.createdAt, kind: "instant" },
};

function entryExists(filters: SQL[]): SQL {
  const condition = and(eq(auditLogs.operation_id, auditOperations.id), ...filters);
  return sql`EXISTS (SELECT 1 FROM ${auditLogs} WHERE ${condition})`;
}

function operationConditions(filters: AuditOperationFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.kinds.length === 1) conditions.push(eq(auditOperations.kind, filters.kinds[0]!));
  else if (filters.kinds.length > 1) conditions.push(inArray(auditOperations.kind, filters.kinds));
  if (filters.userIds.length === 1)
    conditions.push(or(eq(auditOperations.actor_id, filters.userIds[0]!), eq(auditOperations.performed_by, filters.userIds[0]!))!);
  else if (filters.userIds.length > 1)
    conditions.push(or(inArray(auditOperations.actor_id, filters.userIds), inArray(auditOperations.performed_by, filters.userIds))!);
  if (filters.from !== undefined) conditions.push(gte(auditOperations.createdAt, filters.from));
  if (filters.to !== undefined) conditions.push(lte(auditOperations.createdAt, filters.to));
  if (filters.countryCodes !== undefined) conditions.push(inArray(auditOperations.country_code, [...filters.countryCodes]));

  const entryFilters: SQL[] = [];
  if (filters.entities.length === 1) entryFilters.push(eq(auditLogs.entity, filters.entities[0]!));
  else if (filters.entities.length > 1) entryFilters.push(inArray(auditLogs.entity, filters.entities));
  if (filters.ops.length === 1) entryFilters.push(eq(auditLogs.op, filters.ops[0]!));
  else if (filters.ops.length > 1) entryFilters.push(inArray(auditLogs.op, filters.ops));
  if (filters.stationIds.length === 1) entryFilters.push(eq(auditLogs.station_id, filters.stationIds[0]!));
  else if (filters.stationIds.length > 1) entryFilters.push(inArray(auditLogs.station_id, filters.stationIds));
  if (filters.query !== undefined && filters.query !== "") {
    const numeric = /^\d+$/.test(filters.query) ? Number(filters.query) : null;
    if (numeric !== null && Number.isSafeInteger(numeric) && numeric <= 2_147_483_647)
      entryFilters.push(or(eq(auditLogs.record_id, filters.query), eq(auditLogs.station_id, numeric))!);
    else entryFilters.push(or(eq(auditLogs.record_id, filters.query), sql`${auditLogs.metadata}::text ILIKE ${containsPattern(filters.query)}`)!);
  }
  if (entryFilters.length > 0) conditions.push(entryExists(entryFilters));
  return conditions;
}

function toOperationRow(row: typeof auditOperations.$inferSelect): AuditOperationRow {
  return { ...row, metadata: toAuditMetadata(row.metadata) };
}

function toAuditEntry(row: typeof auditLogs.$inferSelect): AuditEntry {
  return { ...row, metadata: toAuditMetadata(row.metadata) };
}

async function summaries(handle: Database | DbTx, rows: (typeof auditOperations.$inferSelect)[]): Promise<AuditOperationSummary[]> {
  if (rows.length === 0) return [];
  const operationIds = rows.map((row) => row.id);
  const aggregateRows = await handle
    .select({
      operation_id: auditLogs.operation_id,
      entity: auditLogs.entity,
      op: auditLogs.op,
      count: count(),
      station_ids: sql<number[]>`COALESCE(array_agg(DISTINCT ${auditLogs.station_id}) FILTER (WHERE ${auditLogs.station_id} IS NOT NULL), '{}')`,
    })
    .from(auditLogs)
    .where(inArray(auditLogs.operation_id, operationIds))
    .groupBy(auditLogs.operation_id, auditLogs.entity, auditLogs.op);

  const countsByOperation = new Map<number, AuditCount[]>();
  const stationIdsByOperation = new Map<number, Set<number>>();
  for (const aggregate of aggregateRows) {
    const counts = countsByOperation.get(aggregate.operation_id) ?? [];
    counts.push({ entity: aggregate.entity, op: aggregate.op, count: aggregate.count });
    countsByOperation.set(aggregate.operation_id, counts);
    const stationIds = stationIdsByOperation.get(aggregate.operation_id) ?? new Set<number>();
    for (const stationId of aggregate.station_ids) stationIds.add(stationId);
    stationIdsByOperation.set(aggregate.operation_id, stationIds);
  }

  const userIds = [...new Set(rows.flatMap((row) => [row.actor_id, row.performed_by]).filter((id): id is string => id !== null))];
  const userRows =
    userIds.length === 0
      ? []
      : await handle
          .select({ id: users.id, name: users.name, username: users.username, image: users.image })
          .from(users)
          .where(inArray(users.id, userIds));
  const usersById = new Map<string, UserSummary>(userRows.map((user) => [user.id, user]));

  return rows.map((row) => {
    const counts = countsByOperation.get(row.id) ?? [];
    return {
      ...toOperationRow(row),
      actor: row.actor_id === null ? null : (usersById.get(row.actor_id) ?? null),
      performer: row.performed_by === null ? null : (usersById.get(row.performed_by) ?? null),
      entry_count: counts.reduce((total, item) => total + item.count, 0),
      counts,
      station_ids: [...(stationIdsByOperation.get(row.id) ?? [])],
    };
  });
}

export async function fetchAuditOperationPage(
  filters: AuditOperationFilters,
  paging: CursorPaging,
): Promise<{ data: AuditOperationSummary[]; nextCursor: string | null; total?: number }> {
  const where = and(...operationConditions(filters));
  const keyset = createKeyset(paging.sort, auditOperations.id, SORT_COLUMNS, paging.cursor);
  const [rows, totals] = await Promise.all([
    db
      .select({ operation: auditOperations, key: keyset.key })
      .from(auditOperations)
      .where(and(where, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(paging.limit + 1)
      .offset(paging.offset ?? 0),
    paging.includeTotal ? db.select({ total: count() }).from(auditOperations).where(where) : null,
  ]);
  const page = rows.slice(0, paging.limit);
  const last = page.at(-1);

  return {
    data: await summaries(
      db,
      page.map((row) => row.operation),
    ),
    nextCursor: rows.length > paging.limit && last ? keyset.cursorAfter({ id: last.operation.id, key: last.key }) : null,
    total: totals ? (totals[0]?.total ?? 0) : undefined,
  };
}

export async function fetchReadableStations(
  req: FastifyRequest,
  reach: AuditReach,
  stationIds: readonly number[],
): Promise<Map<number, AuditOperationStation>> {
  const readable = new Map<number, AuditOperationStation>();
  if (stationIds.length === 0) return readable;

  const countryCodes = reach.isEverywhere ? undefined : reach.countryCodes;
  const area = stationAreaConditions({ countryCodes }, await loadHiddenCountryCodes(req));
  const lookups = chunks(stationIds, STATION_IDS_PER_QUERY).map((chunk) => async () => {
    const rows = await db
      .select({ id: stations.id, siteId: stations.station_id, operatorId: stations.operator_id })
      .from(stations)
      .where(and(inArray(stations.id, chunk), ...area));
    for (const row of rows) readable.set(row.id, row);
  });
  await runLimited(lookups);
  return readable;
}

export async function fetchAuditOperationSummary(handle: Database | DbTx, id: number): Promise<AuditOperationSummary | null> {
  const [row] = await handle.select().from(auditOperations).where(eq(auditOperations.id, id)).limit(1);
  if (row === undefined) return null;
  const [summary] = await summaries(handle, [row]);
  return summary ?? null;
}

async function operationLink(id: number | null): Promise<Pick<AuditOperationSummary, "id" | "kind" | "createdAt"> | null> {
  if (id === null) return null;
  const [row] = await db
    .select({ id: auditOperations.id, kind: auditOperations.kind, createdAt: auditOperations.createdAt })
    .from(auditOperations)
    .where(eq(auditOperations.id, id))
    .limit(1);
  return row ?? null;
}

export async function fetchAuditOperation(id: number): Promise<AuditOperationWithEntries | null> {
  const [row] = await db.select().from(auditOperations).where(eq(auditOperations.id, id)).limit(1);
  if (row === undefined) return null;
  const [summary] = await summaries(db, [row]);
  if (summary === undefined) return null;

  const entryRows = await db.select().from(auditLogs).where(eq(auditLogs.operation_id, id)).orderBy(asc(auditLogs.id));
  const operation = toOperationRow(row);
  const revertedEntryIds = await loadRevertedEntryIds(db, id);
  const auditEntries = entryRows.map(toAuditEntry);
  const restoringBandEntries = await findRestoringBandEntries(db, auditEntries);
  const entries = auditEntries.map((entry) => {
    const result = getEntryRevertibility(restoringBandEntries.get(entry.id) ?? entry, { operation, revertedEntryIds });
    return result.revertible ? { ...entry, revertible: true } : { ...entry, revertible: false, revert_reason: result.reason };
  });
  const [reverts, revertedBy] = await Promise.all([operationLink(row.reverts_operation_id), operationLink(row.reverted_by_operation_id)]);
  return {
    ...summary,
    entries,
    revertible: entries.some((entry) => entry.revertible),
    reverts,
    reverted_by: revertedBy,
  };
}
