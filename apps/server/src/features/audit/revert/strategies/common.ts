import type { AuditEntity } from "@openbts/shared/audit";

import type { AuditEntry, AuditMetadata } from "../../types.js";
import { type SnapshotRecord, isSnapshotRecord } from "../columns.js";
import type { PlannedEntry, RevertSkippedField, StrategyContext } from "../types.js";

export function createEmptyPlan(entry: AuditEntry): PlannedEntry {
  return {
    entry,
    actions: [],
    conflicts: [],
    dependencies: [],
    droppedFields: new Set(),
    effects: [],
    async finalize() {},
  };
}

export function snapshotFieldNames(snapshot: SnapshotRecord, omittedFields: readonly string[] = []): string[] {
  const ignoredFields = new Set(["id", "createdAt", "updatedAt", ...omittedFields]);
  return Object.keys(snapshot).filter((field) => !ignoredFields.has(field));
}

export function pendingInsertProvider(context: StrategyContext, entity: AuditEntity, id: number): number | undefined {
  return context.pendingInserts.get(entity)?.get(id);
}

export function inverseMetadata(entryId: number, droppedFields: ReadonlySet<string>): AuditMetadata {
  const metadata: AuditMetadata = { reverts_entry_id: entryId };
  if (droppedFields.size > 0) metadata.skipped_fields = [...droppedFields];
  return metadata;
}

export function asSnapshotArray(value: unknown): SnapshotRecord[] | null {
  if (!Array.isArray(value) || !value.every(isSnapshotRecord)) return null;
  return value;
}

export function appliedSkippedFields(plan: PlannedEntry): RevertSkippedField[] {
  return [...plan.droppedFields].map((field) => ({ entry_id: plan.entry.id, field, reason: "fk_missing" }));
}

export function numberField(record: SnapshotRecord, field: string): number | null {
  const value = record[field];
  if (value === null) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function stringField(record: SnapshotRecord, field: string): string | null {
  const value = record[field];
  return typeof value === "string" ? value : null;
}
