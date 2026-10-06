import { AUDIT_ENTITIES, AUDIT_OPS } from "@openbts/shared/audit";

import type { AuditOperationDetail, AuditOperationList, AuditOperationQuery, AuditRevert, AuditRevertConflict, AuditRevertResult } from "./types";
import { API_V2_BASE, ApiResponseError, CONFLICT_STATUS, appendList, fetchJson, fetchV2Data } from "@/lib/api";

type RevertRequest = { operationId: number; entryIds?: number[]; force: boolean };

const REVERT_CONFLICT_KINDS: Record<AuditRevertConflict["kind"], true> = {
  missing: true,
  stale: true,
  already_absent: true,
  exists: true,
  unique_violation: true,
  fk_missing: true,
  referenced: true,
  station_without_cells: true,
  concurrent_modification: true,
};

function toSearchParams(query: AuditOperationQuery): URLSearchParams {
  const params = new URLSearchParams();
  appendList(params, "include", query.include);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  if (query.sort !== undefined) params.set("sort", query.sort);
  appendList(params, "kinds", query.kinds);
  appendList(params, "entities", query.entities);
  appendList(params, "actions", query.actions);
  appendList(params, "userIds", query.userIds);
  appendList(params, "stationIds", query.stationIds);
  appendList(params, "countryCodes", query.countryCodes);
  if (query.createdAfter !== undefined) params.set("createdAfter", query.createdAfter);
  if (query.createdBefore !== undefined) params.set("createdBefore", query.createdBefore);
  if (query.q !== undefined) params.set("q", query.q);
  if (query.includeTotal === true) params.set("includeTotal", "true");
  return params;
}

export function fetchAuditOperations(query: AuditOperationQuery, signal?: AbortSignal): Promise<AuditOperationList> {
  return fetchJson<AuditOperationList>(`${API_V2_BASE}/audit-operations?${toSearchParams(query).toString()}`, { signal });
}

export function fetchAuditOperation(id: number, signal?: AbortSignal): Promise<AuditOperationDetail> {
  return fetchV2Data<AuditOperationDetail>(`audit-operations/${id}`, { signal });
}

export function revertAuditOperation({ operationId, entryIds, force }: RevertRequest): Promise<AuditRevertResult> {
  const body: AuditRevert = { entryIds, force };
  return fetchV2Data<AuditRevertResult>(`audit-operations/${operationId}/revert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConflictField(value: unknown): boolean {
  return isRecord(value) && typeof value.field === "string";
}

function isDependent(value: unknown): boolean {
  return isRecord(value) && typeof value.table === "string" && typeof value.count === "number";
}

function isRevertConflict(value: unknown): value is AuditRevertConflict {
  if (!isRecord(value)) return false;
  if (typeof value.entryId !== "number" || typeof value.kind !== "string" || typeof value.message !== "string") return false;
  if (!Object.hasOwn(REVERT_CONFLICT_KINDS, value.kind)) return false;
  if (!AUDIT_ENTITIES.some((entity) => entity === value.entity) || !AUDIT_OPS.some((action) => action === value.action)) return false;
  if (value.recordId !== null && typeof value.recordId !== "string") return false;
  if (value.stationId !== null && typeof value.stationId !== "number") return false;
  if (value.fields !== undefined && (!Array.isArray(value.fields) || !value.fields.every(isConflictField))) return false;
  if (value.dependents !== undefined && (!Array.isArray(value.dependents) || !value.dependents.every(isDependent))) return false;
  return value.constraint === undefined || typeof value.constraint === "string";
}

export function getRevertConflicts(error: unknown): AuditRevertConflict[] {
  if (!(error instanceof ApiResponseError) || error.status !== CONFLICT_STATUS) return [];
  const details = error.errors[0]?.details;
  return Array.isArray(details) ? details.filter(isRevertConflict) : [];
}
