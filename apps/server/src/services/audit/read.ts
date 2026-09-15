import { auditLogs, auditOperations, users } from "@openbts/drizzle";
import type { AuditEntity, AuditOp, AuditOperationKind } from "@openbts/shared/audit";
import { type SQL, and, asc, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import type { Database } from "../../database/psql.js";
import type { DbTx } from "../../types/global.js";
import { getEntryRevertibility, loadRevertedEntryIds } from "./revert/revertibility.js";
import type {
  AuditCount,
  AuditEntry,
  AuditMetadata,
  AuditOperationRow,
  AuditOperationSummary,
  AuditOperationWithEntries,
  UserSummary,
} from "./types.js";

type AuditOperationFilters = {
  limit: number;
  offset: number;
  sort: "asc" | "desc";
  kinds: AuditOperationKind[];
  entities: AuditEntity[];
  ops: AuditOp[];
  userIds: string[];
  from?: Date;
  to?: Date;
  stationId?: number;
  query?: string;
};

function metadata(value: unknown): AuditMetadata | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as AuditMetadata) : null;
}

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

  const entryFilters: SQL[] = [];
  if (filters.entities.length === 1) entryFilters.push(eq(auditLogs.entity, filters.entities[0]!));
  else if (filters.entities.length > 1) entryFilters.push(inArray(auditLogs.entity, filters.entities));
  if (filters.ops.length === 1) entryFilters.push(eq(auditLogs.op, filters.ops[0]!));
  else if (filters.ops.length > 1) entryFilters.push(inArray(auditLogs.op, filters.ops));
  if (filters.stationId !== undefined) entryFilters.push(eq(auditLogs.station_id, filters.stationId));
  if (filters.query !== undefined && filters.query !== "") {
    const numeric = /^\d+$/.test(filters.query) ? Number(filters.query) : null;
    if (numeric !== null && Number.isSafeInteger(numeric) && numeric <= 2_147_483_647)
      entryFilters.push(or(eq(auditLogs.record_id, filters.query), eq(auditLogs.station_id, numeric))!);
    else entryFilters.push(or(eq(auditLogs.record_id, filters.query), sql`${auditLogs.metadata}::text ILIKE ${`%${filters.query}%`}`)!);
  }
  if (entryFilters.length > 0) conditions.push(entryExists(entryFilters));
  return conditions;
}

function toOperationRow(row: typeof auditOperations.$inferSelect): AuditOperationRow {
  return { ...row, metadata: metadata(row.metadata) };
}

function toAuditEntry(row: typeof auditLogs.$inferSelect): AuditEntry {
  return { ...row, metadata: metadata(row.metadata) };
}

async function summaries(handle: Database | DbTx, rows: Array<typeof auditOperations.$inferSelect>): Promise<AuditOperationSummary[]> {
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

export async function fetchAuditOperations(filters: AuditOperationFilters): Promise<{ data: AuditOperationSummary[]; totalCount: number }> {
  const conditions = operationConditions(filters);
  const where = conditions.length === 0 ? undefined : and(...conditions);
  const [totalRow, rows] = await Promise.all([
    db.select({ count: count() }).from(auditOperations).where(where),
    db
      .select()
      .from(auditOperations)
      .where(where)
      .orderBy(
        filters.sort === "asc" ? asc(auditOperations.createdAt) : desc(auditOperations.createdAt),
        filters.sort === "asc" ? asc(auditOperations.id) : desc(auditOperations.id),
      )
      .limit(filters.limit)
      .offset(filters.offset),
  ]);
  return { data: await summaries(db, rows), totalCount: totalRow[0]?.count ?? 0 };
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
  const entries = entryRows.map((entryRow) => {
    const entry = toAuditEntry(entryRow);
    const result = getEntryRevertibility(entry, { operation, revertedEntryIds });
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
