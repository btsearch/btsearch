import type { AuditEntry, AuditOperation, AuditOperationDetail, AuditOperationLink, AuditRevertResult } from "@openbts/shared/contract";

import { DetailedErrorResponse } from "../../errors.js";
import { toUserRef } from "../users/userRef.js";
import type { RevertOperationResult } from "./revert/types.js";
import type { AuditOperationSummary, AuditOperationWithEntries } from "./types.js";

const DETAIL_KEYS: Record<string, string> = { entry_id: "entryId", record_id: "recordId", station_id: "stationId", op: "action" };

function toOperationLink(link: AuditOperationWithEntries["reverts"]): AuditOperationLink | null {
  return link === null ? null : { id: link.id, kind: link.kind, createdAt: link.createdAt.toISOString() };
}

function toAuditEntry(entry: AuditOperationWithEntries["entries"][number]): AuditEntry {
  return {
    id: entry.id,
    entity: entry.entity,
    action: entry.op,
    recordId: entry.record_id,
    stationId: entry.station_id,
    oldValues: entry.old_values,
    newValues: entry.new_values,
    metadata: entry.metadata,
    isRevertible: entry.revertible,
    revertReason: entry.revert_reason ?? null,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function toAuditOperation(operation: AuditOperationSummary): AuditOperation {
  return {
    id: operation.id,
    kind: operation.kind,
    source: operation.source,
    clientKey: operation.client_key,
    actor: operation.actor === null ? null : toUserRef(operation.actor),
    performer: operation.performer === null ? null : toUserRef(operation.performer),
    ipAddress: operation.ip_address,
    userAgent: operation.user_agent,
    metadata: operation.metadata,
    revertsOperationId: operation.reverts_operation_id,
    revertedByOperationId: operation.reverted_by_operation_id,
    countryCode: operation.country_code,
    entryCount: operation.entry_count,
    counts: operation.counts.map((item) => ({ entity: item.entity, action: item.op, count: item.count })),
    stationIds: operation.station_ids,
    createdAt: operation.createdAt.toISOString(),
  };
}

export function toAuditOperationDetail(operation: AuditOperationWithEntries): AuditOperationDetail {
  return {
    ...toAuditOperation(operation),
    entries: operation.entries.map(toAuditEntry),
    isRevertible: operation.revertible,
    revertsOperation: toOperationLink(operation.reverts),
    revertedByOperation: toOperationLink(operation.reverted_by),
  };
}

export function toAuditRevertResult(result: RevertOperationResult): AuditRevertResult {
  return {
    operation: toAuditOperation(result.operation),
    revertedEntryIds: result.reverted,
    skipped: result.skipped.map((item) => ({ entryId: item.entry_id, reason: item.reason, message: item.message ?? null })),
    skippedFields: result.skipped_fields.map((item) => ({ entryId: item.entry_id, field: item.field, reason: item.reason })),
    affectedStationIds: result.affected_station_ids,
  };
}

function renameDetailKeys(detail: unknown): unknown {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return detail;
  return Object.fromEntries(Object.entries(detail).map(([key, value]) => [DETAIL_KEYS[key] ?? key, value]));
}

export function renameRevertErrorDetails(error: unknown): void {
  if (error instanceof DetailedErrorResponse) error.details = error.details.map(renameDetailKeys);
}
