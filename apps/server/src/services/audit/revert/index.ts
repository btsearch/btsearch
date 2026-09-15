import { auditLogs, auditOperations } from "@openbts/drizzle";
import { asc, eq } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import postgres from "postgres";

import db from "../../../database/psql.js";
import { DetailedErrorResponse, ErrorResponse } from "../../../errors.js";
import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { queueStationCellsChangedNotification } from "../../notifications/stationCellChanges.js";
import { syncStationsPermitsAssociations } from "../../stationsPermitsAssociation.service.js";
import { runAuditedOperation } from "../operation.js";
import { fetchAuditOperationSummary } from "../read.js";
import type { AuditEntry, AuditMetadata, AuditOperationRow, AuditOperationSummary } from "../types.js";
import { type AppliedRevertPlan, applyRevertPlan } from "./apply.js";
import { buildRevertPlan } from "./plan.js";
import { getEntryRevertibility, loadActiveRevertCoverage, loadRevertedEntryIds } from "./revertibility.js";
import type { RevertConflict, RevertOperationInput, RevertOperationResult, RevertSkipped } from "./types.js";

function metadata(value: unknown): AuditMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as AuditMetadata) : {};
}

function operationRow(row: typeof auditOperations.$inferSelect): AuditOperationRow {
  return { ...row, metadata: metadata(row.metadata) };
}

function auditEntry(row: typeof auditLogs.$inferSelect): AuditEntry {
  return { ...row, metadata: row.metadata === null ? null : metadata(row.metadata) };
}

function markerMetadata(current: AuditMetadata, partialRevertIds: readonly number[]): AuditMetadata {
  const next = { ...current };
  if (partialRevertIds.length === 0) delete next.partial_reverts;
  else next.partial_reverts = partialRevertIds;
  return next;
}

function postgresError(error: unknown): postgres.PostgresError | null {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return cause instanceof postgres.PostgresError ? cause : null;
}

function concurrentConflict(entry: AuditEntry): RevertConflict {
  return {
    entry_id: entry.id,
    entity: entry.entity,
    op: entry.op,
    record_id: entry.record_id,
    station_id: entry.station_id,
    kind: "concurrent_modification",
    message: "The data changed while the revert was being applied",
  };
}

async function loadOperationAndEntries(operationId: number): Promise<{ operation: AuditOperationRow; entries: AuditEntry[] }> {
  const [row] = await db.select().from(auditOperations).where(eq(auditOperations.id, operationId)).limit(1);
  if (row === undefined) throw new ErrorResponse("NOT_FOUND");
  const rows = await db.select().from(auditLogs).where(eq(auditLogs.operation_id, operationId)).orderBy(asc(auditLogs.id));
  return { operation: operationRow(row), entries: rows.map(auditEntry) };
}

function selectedEntries(entries: readonly AuditEntry[], entryIds?: readonly number[]): AuditEntry[] {
  if (entryIds === undefined) return [...entries];
  const requested = new Set(entryIds);
  const available = new Set(entries.map((entry) => entry.id));
  const missing = [...requested].filter((id) => !available.has(id));
  if (missing.length > 0) throw new ErrorResponse("BAD_REQUEST", { message: `Audit entries do not belong to this operation: ${missing.join(", ")}` });
  return entries.filter((entry) => requested.has(entry.id));
}

async function recomputeMarkerChain(tx: DbTx, operationId: number): Promise<boolean> {
  const visited = new Set<number>();
  const recompute = async (targetId: number): Promise<boolean> => {
    if (visited.has(targetId)) throw new Error("Audit revert lineage contains a cycle");
    visited.add(targetId);
    const [row] = await tx.select().from(auditOperations).where(eq(auditOperations.id, targetId)).for("no key update").limit(1);
    if (row === undefined) return false;
    const operation = operationRow(row);
    const entryRows = await tx.select().from(auditLogs).where(eq(auditLogs.operation_id, targetId));
    const entries = entryRows.map(auditEntry);
    const baselineOperation = { ...operation, reverted_by_operation_id: null };
    const revertibleEntryIds = entries
      .filter((entry) => getEntryRevertibility(entry, { operation: baselineOperation, revertedEntryIds: new Set() }).revertible)
      .map((entry) => entry.id);
    const coverage = await loadActiveRevertCoverage(tx, targetId);
    const fullyReverted =
      revertibleEntryIds.length > 0 &&
      revertibleEntryIds.every((entryId) => coverage.revertedEntryIds.has(entryId) && !coverage.incompleteEntryIds.has(entryId));
    const contributingOperationIds = [...coverage.contributingOperationIds].sort((left, right) => left - right);
    await tx
      .update(auditOperations)
      .set({
        reverted_by_operation_id: fullyReverted ? (contributingOperationIds.at(-1) ?? null) : null,
        metadata: markerMetadata(metadata(operation.metadata), fullyReverted ? [] : contributingOperationIds),
      })
      .where(eq(auditOperations.id, targetId));
    if (operation.reverts_operation_id !== null) await recompute(operation.reverts_operation_id);
    return fullyReverted;
  };
  return recompute(operationId);
}

export async function revertOperation(input: RevertOperationInput): Promise<RevertOperationResult> {
  const initial = await loadOperationAndEntries(input.operationId);
  if (initial.operation.reverted_by_operation_id !== null)
    throw new ErrorResponse("BAD_REQUEST", { message: "This operation has already been reverted" });
  const requestedEntries = selectedEntries(initial.entries, input.entryIds);
  if (requestedEntries.length === 0) throw new ErrorResponse("BAD_REQUEST", { message: "No audit entries were selected" });
  const firstEntry = requestedEntries[0]!;
  const context = { ...input.ctx, clientKey: null, clientKind: null };
  const requestedEntryIds = input.entryIds === undefined ? undefined : [...new Set(input.entryIds)];

  let transactionResult: AppliedRevertPlan & { operation: AuditOperationSummary };
  try {
    transactionResult = await runAuditedOperation(
      context,
      {
        kind: "revert",
        revertsOperationId: input.operationId,
        metadata: {
          forced: input.force,
          ...(requestedEntryIds === undefined ? {} : { entry_ids: requestedEntryIds }),
        },
        transactionConfig: { isolationLevel: "repeatable read" },
      },
      async (tx, audit) => {
        const [lockedRow] = await tx.select().from(auditOperations).where(eq(auditOperations.id, input.operationId)).for("no key update").limit(1);
        if (lockedRow === undefined) throw new ErrorResponse("NOT_FOUND");
        const operation = operationRow(lockedRow);
        if (operation.reverted_by_operation_id !== null)
          throw new ErrorResponse("BAD_REQUEST", { message: "This operation has already been reverted" });

        const entryRows = await tx.select().from(auditLogs).where(eq(auditLogs.operation_id, operation.id)).orderBy(asc(auditLogs.id));
        const entries = entryRows.map(auditEntry);
        const selected = selectedEntries(entries, input.entryIds);
        const revertedEntryIds = await loadRevertedEntryIds(tx, operation.id);
        const skipped: RevertSkipped[] = [];
        const available = selected.filter((entry) => {
          const result = getEntryRevertibility(entry, { operation, revertedEntryIds });
          if (result.revertible) return true;
          skipped.push({ entry_id: entry.id, reason: result.reason, message: "This audit entry cannot be reverted" });
          return false;
        });
        if (available.length === 0)
          throw new DetailedErrorResponse("BAD_REQUEST", skipped, {
            message: skipped.map((item) => item.reason).join(", "),
          });

        const plans = await buildRevertPlan(tx, available);
        const applied = await applyRevertPlan(tx, audit, plans, input.force);
        if (applied.reverted.length === 0)
          throw new DetailedErrorResponse("BAD_REQUEST", [...skipped, ...applied.skipped], {
            message: "No selected changes could be reverted",
          });
        const operationMetadata: AuditMetadata = {
          forced: input.force,
          ...(requestedEntryIds === undefined ? {} : { entry_ids: requestedEntryIds }),
          partial: true,
          target_kind: operation.kind,
          ...(applied.skippedFields.length === 0 ? {} : { skipped_fields: applied.skippedFields }),
        };
        await tx.update(auditOperations).set({ metadata: operationMetadata }).where(eq(auditOperations.id, audit.operationId));
        const fullyReverted = await recomputeMarkerChain(tx, operation.id);
        await tx
          .update(auditOperations)
          .set({ metadata: { ...operationMetadata, partial: !fullyReverted } })
          .where(eq(auditOperations.id, audit.operationId));
        const revertSummary = await fetchAuditOperationSummary(tx, audit.operationId);
        if (revertSummary === null) throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: "The revert operation could not be loaded" });
        return {
          ...applied,
          skipped: [...skipped, ...applied.skipped],
          operation: revertSummary,
        };
      },
    );
  } catch (error) {
    const cause = postgresError(error);
    if (cause?.code === "40001" || cause?.code === "40P01")
      throw new DetailedErrorResponse("CONFLICT", [concurrentConflict(firstEntry)], {
        message: "The data changed while the revert was being applied",
        cause: error,
      });
    throw error;
  }

  for (const [stationId, counts] of transactionResult.cellChanges) queueStationCellsChangedNotification({ stationId, counts });
  if (transactionResult.stationOrLocationWritten)
    void syncStationsPermitsAssociations().catch((error) =>
      logger.error("Failed to sync stations_permits after audit revert", {
        error: error instanceof Error ? error.message : String(error),
      }),
    );

  return {
    operation: transactionResult.operation,
    reverted: transactionResult.reverted,
    skipped: transactionResult.skipped,
    skipped_fields: transactionResult.skippedFields,
    affected_station_ids: transactionResult.affectedStationIds,
  };
}

export type {
  RevertConflict,
  RevertConflictField,
  RevertConflictKind,
  RevertDependent,
  RevertOperationInput,
  RevertOperationResult,
  RevertSkipped,
  RevertSkippedField,
} from "./types.js";
