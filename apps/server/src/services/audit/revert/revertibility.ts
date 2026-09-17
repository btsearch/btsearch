import { auditLogs, auditOperations } from "@openbts/drizzle";
import type { AuditEntity } from "@openbts/shared/audit";
import { inArray } from "drizzle-orm";

import type { Database } from "../../../database/psql.js";
import type { DbTx } from "../../../types/global.js";
import type { AuditEntry, AuditOperationRow } from "../types.js";
import { isSnapshotRecord as isRecord } from "./columns.js";
import { getLocationPhotoMove } from "./strategies/locationPhotos.js";

export type RevertReason =
  | "unsupported_entity"
  | "unsupported_op"
  | "operation_reverted"
  | "already_reverted"
  | "missing_record_id"
  | "missing_old_values"
  | "missing_new_values"
  | "missing_details"
  | "no_changes";

export type EntryRevertibility = { revertible: true } | { revertible: false; reason: RevertReason };

const REVERTIBLE_ENTITIES = new Set<AuditEntity>([
  "cells",
  "stations",
  "locations",
  "station_sectors",
  "extra_identificators",
  "station_photo_selections",
  "location_photos",
  "operators",
  "bands",
  "regions",
]);

function snapshotsEqual(left: unknown, right: unknown): boolean {
  const stripAuditTimestamps = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripAuditTimestamps);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "createdAt" && key !== "updatedAt" && key !== "statusChangedAt")
        .map(([key, nested]) => [key, stripAuditTimestamps(nested)]),
    );
  };
  return JSON.stringify(stripAuditTimestamps(left)) === JSON.stringify(stripAuditTimestamps(right));
}

function requiresDetails(entry: AuditEntry): boolean {
  if (entry.entity !== "cells" || entry.op !== "delete" || !isRecord(entry.old_values)) return false;
  const rat = entry.old_values.rat;
  if (rat !== "GSM" && rat !== "UMTS" && rat !== "LTE" && rat !== "NR") return false;
  if (isRecord(entry.old_values.details)) return false;
  return !isRecord(entry.old_values[rat.toLowerCase()]);
}

export function getEntryRevertibility(
  entry: AuditEntry,
  { operation, revertedEntryIds }: { operation: AuditOperationRow; revertedEntryIds: ReadonlySet<number> },
): EntryRevertibility {
  const stationScopedCollection = entry.entity === "station_sectors" || entry.entity === "station_photo_selections";
  if (operation.kind === "revert") return { revertible: false, reason: "unsupported_op" };
  if (operation.reverted_by_operation_id !== null) return { revertible: false, reason: "operation_reverted" };
  if (revertedEntryIds.has(entry.id)) return { revertible: false, reason: "already_reverted" };
  if (operation.source === "import") return { revertible: false, reason: "unsupported_op" };
  if (!REVERTIBLE_ENTITIES.has(entry.entity)) return { revertible: false, reason: "unsupported_entity" };
  if (stationScopedCollection && entry.station_id === null) return { revertible: false, reason: "missing_record_id" };
  if (
    !stationScopedCollection &&
    (entry.record_id === null || !/^\d+$/.test(entry.record_id) || !Number.isSafeInteger(Number(entry.record_id)) || Number(entry.record_id) <= 0)
  )
    return { revertible: false, reason: "missing_record_id" };

  if (entry.op === "create" && entry.new_values === null) return { revertible: false, reason: "missing_new_values" };
  if (entry.op === "delete" && entry.old_values === null) return { revertible: false, reason: "missing_old_values" };
  if (entry.op === "update") {
    if (entry.old_values === null) return { revertible: false, reason: "missing_old_values" };
    if (entry.new_values === null) return { revertible: false, reason: "missing_new_values" };
    if (snapshotsEqual(entry.old_values, entry.new_values)) return { revertible: false, reason: "no_changes" };
  }
  if (requiresDetails(entry)) return { revertible: false, reason: "missing_details" };

  if (stationScopedCollection && entry.op !== "update") return { revertible: false, reason: "unsupported_op" };
  if (entry.entity === "location_photos" && getLocationPhotoMove(entry) === null) return { revertible: false, reason: "unsupported_op" };
  if (stationScopedCollection && (!Array.isArray(entry.old_values) || !Array.isArray(entry.new_values)))
    return { revertible: false, reason: "unsupported_op" };
  if (
    entry.entity === "cells" &&
    entry.op === "update" &&
    isRecord(entry.old_values) &&
    isRecord(entry.new_values) &&
    entry.old_values.rat !== entry.new_values.rat
  )
    return { revertible: false, reason: "unsupported_op" };
  if (entry.entity === "stations" && entry.op === "delete" && entry.new_values === null) return { revertible: false, reason: "unsupported_op" };
  return { revertible: true };
}

type EntryCoverage = "full" | "partial";

type RevertNode = {
  id: number;
  skippedTargetEntryIds: Set<number>;
  entries: Array<{ id: number; targetEntryId: number }>;
};

export type ActiveRevertCoverage = {
  revertedEntryIds: Set<number>;
  incompleteEntryIds: Set<number>;
  contributingOperationIds: Set<number>;
};

function entryCoverageInRevert(coverage: ActiveRevertCoverage, entryId: number): EntryCoverage | null {
  if (coverage.incompleteEntryIds.has(entryId)) return "partial";
  if (coverage.revertedEntryIds.has(entryId)) return "full";
  return null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function revertedEntryId(value: unknown): number | null {
  if (!isRecord(value)) return null;
  return positiveInteger(value.reverts_entry_id);
}

function skippedTargetEntryIds(value: unknown): Set<number> {
  if (!isRecord(value) || !Array.isArray(value.skipped_fields)) return new Set();
  const result = new Set<number>();
  for (const item of value.skipped_fields) {
    if (!isRecord(item)) continue;
    const entryId = positiveInteger(item.entry_id);
    if (entryId !== null) result.add(entryId);
  }
  return result;
}

async function loadRevertGraph(handle: Database | DbTx, rootOperationIds: readonly number[]): Promise<Map<number, RevertNode[]>> {
  const childrenByTarget = new Map<number, RevertNode[]>();
  const discovered = new Set<number>();

  const visit = async (targetIds: readonly number[]): Promise<void> => {
    if (targetIds.length === 0) return;
    const childRows = await handle
      .select({ id: auditOperations.id, targetOperationId: auditOperations.reverts_operation_id, metadata: auditOperations.metadata })
      .from(auditOperations)
      .where(inArray(auditOperations.reverts_operation_id, [...targetIds]));
    const freshRows = childRows.filter(
      (row): row is typeof row & { targetOperationId: number } => row.targetOperationId !== null && !discovered.has(row.id),
    );
    if (freshRows.length === 0) return;
    for (const row of freshRows) discovered.add(row.id);

    const entryRows = await handle
      .select({ id: auditLogs.id, operationId: auditLogs.operation_id, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(
        inArray(
          auditLogs.operation_id,
          freshRows.map((row) => row.id),
        ),
      );
    const entriesByOperation = new Map<number, Array<{ id: number; targetEntryId: number }>>();
    for (const row of entryRows) {
      const targetEntryId = revertedEntryId(row.metadata);
      if (targetEntryId === null) continue;
      const entries = entriesByOperation.get(row.operationId) ?? [];
      entries.push({ id: row.id, targetEntryId });
      entriesByOperation.set(row.operationId, entries);
    }
    for (const row of freshRows) {
      const children = childrenByTarget.get(row.targetOperationId) ?? [];
      children.push({
        id: row.id,
        skippedTargetEntryIds: skippedTargetEntryIds(row.metadata),
        entries: entriesByOperation.get(row.id) ?? [],
      });
      childrenByTarget.set(row.targetOperationId, children);
    }
    await visit(freshRows.map((row) => row.id));
  };

  await visit([...new Set(rootOperationIds)]);
  return childrenByTarget;
}

function computeCoverage(
  operationId: number,
  childrenByTarget: ReadonlyMap<number, readonly RevertNode[]>,
  memo: Map<number, ActiveRevertCoverage>,
  visiting: Set<number>,
): ActiveRevertCoverage {
  const cached = memo.get(operationId);
  if (cached !== undefined) return cached;
  if (visiting.has(operationId)) throw new Error("Audit revert lineage contains a cycle");
  visiting.add(operationId);

  const entryStates = new Map<number, EntryCoverage>();
  const contributingOperationIds = new Set<number>();
  for (const child of childrenByTarget.get(operationId) ?? []) {
    const childCoverage = computeCoverage(child.id, childrenByTarget, memo, visiting);
    let contributes = false;
    for (const entry of child.entries) {
      const revertedState = entryCoverageInRevert(childCoverage, entry.id);
      if (revertedState === "full") continue;
      let state: EntryCoverage = "full";
      if (revertedState === "partial" || child.skippedTargetEntryIds.has(entry.targetEntryId)) state = "partial";
      const current = entryStates.get(entry.targetEntryId);
      if (current !== "full") entryStates.set(entry.targetEntryId, state);
      contributes = true;
    }
    if (contributes) contributingOperationIds.add(child.id);
  }

  visiting.delete(operationId);
  const coverage: ActiveRevertCoverage = {
    revertedEntryIds: new Set(entryStates.keys()),
    incompleteEntryIds: new Set([...entryStates].filter(([, state]) => state === "partial").map(([entryId]) => entryId)),
    contributingOperationIds,
  };
  memo.set(operationId, coverage);
  return coverage;
}

export async function loadActiveRevertCoverageByOperation(
  handle: Database | DbTx,
  operationIds: readonly number[],
): Promise<Map<number, ActiveRevertCoverage>> {
  if (operationIds.length === 0) return new Map();
  const childrenByTarget = await loadRevertGraph(handle, operationIds);
  const memo = new Map<number, ActiveRevertCoverage>();
  const result = new Map<number, ActiveRevertCoverage>();
  for (const operationId of operationIds) result.set(operationId, computeCoverage(operationId, childrenByTarget, memo, new Set()));
  return result;
}

export async function loadRevertedEntryIdsByOperation(handle: Database | DbTx, operationIds: readonly number[]): Promise<Map<number, Set<number>>> {
  const coverage = await loadActiveRevertCoverageByOperation(handle, operationIds);
  return new Map([...coverage].map(([operationId, state]) => [operationId, state.revertedEntryIds]));
}

export async function loadActiveRevertCoverage(handle: Database | DbTx, operationId: number): Promise<ActiveRevertCoverage> {
  const coverage = await loadActiveRevertCoverageByOperation(handle, [operationId]);
  return (
    coverage.get(operationId) ?? {
      revertedEntryIds: new Set(),
      incompleteEntryIds: new Set(),
      contributingOperationIds: new Set(),
    }
  );
}

export async function loadRevertedEntryIds(handle: Database | DbTx, operationId: number): Promise<Set<number>> {
  return (await loadActiveRevertCoverage(handle, operationId)).revertedEntryIds;
}
