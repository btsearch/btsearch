import type { PgTable } from "drizzle-orm/pg-core";

import { type SnapshotRecord, columnDataType, trackedColumnNames } from "./columns.js";
import type { RevertConflictField } from "./types.js";

function normalizeObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeValue(value[key])]),
  ) as Record<string, unknown>;
}

export function normalizeValue(value: unknown, dataType?: string): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "bigint") return value.toString();
  if (dataType?.startsWith("number")) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  if (dataType?.startsWith("bigint")) {
    try {
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return value;
      return BigInt(value).toString();
    } catch {
      return value;
    }
  }
  if (dataType?.includes("date")) {
    if (typeof value !== "string" && typeof value !== "number") return value;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) return time;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (typeof value === "object") return normalizeObject(value as Record<string, unknown>);
  return value;
}

export function valuesEqual(left: unknown, right: unknown, dataType?: string): boolean {
  return JSON.stringify(normalizeValue(left, dataType)) === JSON.stringify(normalizeValue(right, dataType));
}

export function changedFields(table: PgTable, oldValues: SnapshotRecord, newValues: SnapshotRecord): string[] {
  return trackedColumnNames(table, oldValues, newValues).filter(
    (field) => !valuesEqual(oldValues[field], newValues[field], columnDataType(table, field)),
  );
}

export function staleFields(table: PgTable, expected: SnapshotRecord, current: SnapshotRecord, fields: readonly string[]): RevertConflictField[] {
  return fields.flatMap((field) => {
    if (valuesEqual(expected[field], current[field], columnDataType(table, field))) return [];
    return [{ field, expected: expected[field], current: current[field] }];
  });
}

export function staleNestedFields(
  prefix: string,
  expected: SnapshotRecord,
  current: SnapshotRecord,
  fields: readonly string[],
): RevertConflictField[] {
  return fields.flatMap((field) => {
    if (valuesEqual(expected[field], current[field])) return [];
    return [{ field: `${prefix}.${field}`, expected: expected[field], current: current[field] }];
  });
}
