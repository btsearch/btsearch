import { AUDIT_ENTITIES, AUDIT_OPS } from "@openbts/shared/audit";

import { REVERT_CONFLICT_KINDS } from "./types";
import type { AuditOperationDetail, AuditOperationFilters, AuditOperationSummary, RevertAuditOperationResult, RevertConflict } from "./types";
import { API_BASE, ApiResponseError, fetchJson } from "@/lib/api";

type AuditOperationsResponse = { data: AuditOperationSummary[]; totalCount: number };
const revertConflictKinds = new Set<string>(REVERT_CONFLICT_KINDS);

function appendList(params: URLSearchParams, key: string, values: readonly string[] | undefined): void {
  if (values && values.length > 0) params.set(key, values.join(","));
}

export function fetchAuditOperations(filters: AuditOperationFilters, signal?: AbortSignal): Promise<AuditOperationsResponse> {
  const params = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
    sort: filters.sort,
  });
  appendList(params, "kinds", filters.kinds);
  appendList(params, "entities", filters.entities);
  appendList(params, "ops", filters.ops);
  appendList(params, "user_ids", filters.userIds);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.stationId !== undefined) params.set("station_id", String(filters.stationId));
  if (filters.q) params.set("q", filters.q);
  return fetchJson<AuditOperationsResponse>(`${API_BASE}/audit-operations?${params.toString()}`, { signal });
}

export async function fetchAuditOperation(id: number, signal?: AbortSignal): Promise<AuditOperationDetail> {
  const response = await fetchJson<{ data: AuditOperationDetail }>(`${API_BASE}/audit-operations/${id}`, { signal });
  return response.data;
}

export async function revertAuditOperation({
  operationId,
  entryIds,
  force,
}: {
  operationId: number;
  entryIds?: number[];
  force?: boolean;
}): Promise<RevertAuditOperationResult> {
  const response = await fetchJson<{ data: RevertAuditOperationResult }>(`${API_BASE}/audit-operations/${operationId}/revert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(entryIds ? { entry_ids: entryIds } : {}), ...(force ? { force: true } : {}) }),
  });
  return response.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConflictField(value: unknown): boolean {
  return isRecord(value) && typeof value.field === "string" && "expected" in value && "current" in value;
}

function isDependent(value: unknown): boolean {
  return isRecord(value) && typeof value.table === "string" && typeof value.count === "number";
}

function isRevertConflict(value: unknown): value is RevertConflict {
  if (!isRecord(value)) return false;
  if (typeof value.entry_id !== "number" || typeof value.kind !== "string" || typeof value.message !== "string") return false;
  if (!revertConflictKinds.has(value.kind)) return false;
  if (!AUDIT_ENTITIES.some((entity) => entity === value.entity) || !AUDIT_OPS.some((op) => op === value.op)) return false;
  if (value.record_id !== null && typeof value.record_id !== "string") return false;
  if (value.station_id !== null && typeof value.station_id !== "number") return false;
  if (value.fields !== undefined && (!Array.isArray(value.fields) || !value.fields.every(isConflictField))) return false;
  if (value.dependents !== undefined && (!Array.isArray(value.dependents) || !value.dependents.every(isDependent))) return false;
  return value.constraint === undefined || typeof value.constraint === "string";
}

export function getRevertConflicts(error: unknown): RevertConflict[] {
  if (!(error instanceof ApiResponseError) || error.status !== 409) return [];
  const details = error.errors[0]?.details;
  return Array.isArray(details) ? details.filter(isRevertConflict) : [];
}

export function fetchRecentAuditOperations(signal?: AbortSignal): Promise<AuditOperationsResponse> {
  return fetchAuditOperations({ limit: 25, offset: 0, sort: "desc" }, signal);
}
