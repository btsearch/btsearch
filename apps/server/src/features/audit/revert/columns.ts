import { type InferInsertModel, getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export type SnapshotRecord = Record<string, unknown>;

const AUDIT_IGNORED_COLUMNS = new Set(["createdAt", "updatedAt", "statusChangedAt"]);

export function isSnapshotRecord(value: unknown): value is SnapshotRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireSnapshot(value: unknown, label: string): SnapshotRecord {
  if (!isSnapshotRecord(value)) throw new Error(`Invalid ${label} audit snapshot`);
  return value;
}

export function recordIdNumber(recordId: string | null): number | null {
  if (recordId === null || !/^\d+$/.test(recordId)) return null;
  const value = Number(recordId);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function coerceColumnValue(dataType: string, value: unknown): unknown {
  if (value === null) return null;
  if (dataType.startsWith("number")) {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (dataType.startsWith("bigint")) {
    try {
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return value;
      return BigInt(value);
    } catch {
      return value;
    }
  }
  if (dataType.includes("date")) {
    if (value instanceof Date) return value;
    if (typeof value !== "string" && typeof value !== "number") return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  return value;
}

export function writableColumnNames(table: PgTable): string[] {
  return Object.entries(getTableColumns(table))
    .filter(([, column]) => column.generated === undefined && column.generatedIdentity === undefined)
    .map(([name]) => name);
}

export function trackedColumnNames(table: PgTable, oldValues: SnapshotRecord, newValues: SnapshotRecord): string[] {
  return writableColumnNames(table).filter(
    (name) => name !== "id" && !AUDIT_IGNORED_COLUMNS.has(name) && Object.hasOwn(oldValues, name) && Object.hasOwn(newValues, name),
  );
}

export function snapshotToRow<TTable extends PgTable>(
  table: TTable,
  snapshot: SnapshotRecord,
  options: { includeIdentity?: boolean; fields?: readonly string[]; omit?: readonly string[] } = {},
): Partial<InferInsertModel<TTable>> {
  const columns = getTableColumns(table);
  const includedFields = options.fields === undefined ? null : new Set(options.fields);
  const omittedFields = new Set(options.omit ?? []);
  const row: Record<string, unknown> = {};

  for (const [name, column] of Object.entries(columns)) {
    if (!Object.hasOwn(snapshot, name) || omittedFields.has(name)) continue;
    if (includedFields !== null && !includedFields.has(name)) continue;
    if (column.generated !== undefined) continue;
    if (column.generatedIdentity !== undefined && options.includeIdentity !== true) continue;
    row[name] = coerceColumnValue(column.dataType, snapshot[name]);
  }

  return row as Partial<InferInsertModel<TTable>>;
}

export function columnDataType(table: PgTable, field: string): string | undefined {
  return getTableColumns(table)[field]?.dataType;
}
