import type { Paging } from "@openbts/shared/contract";

import { API_V2_BASE, type AuditOperationHandle, type DataEnvelope, JSON_HEADERS, NOT_FOUND_STATUS, fetchJson, fetchV2Data } from "@/lib/api";

function toApiUrl(path: string): string {
  return `${API_V2_BASE}/${path}`;
}

export async function fetchDataOrNull<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const response = await fetchJson<DataEnvelope<T> | null>(toApiUrl(path), { signal, allowedErrors: [NOT_FOUND_STATUS] });
  return response?.data ?? null;
}

export async function fetchTotal(path: string, filters: Record<string, string>, signal?: AbortSignal): Promise<number> {
  const query = new URLSearchParams({ ...filters, limit: "1", includeTotal: "true" });
  const response = await fetchJson<{ paging: Paging }>(toApiUrl(`${path}?${query.toString()}`), { signal });
  return response.paging.total ?? 0;
}

export function postData<T>(path: string, body: object, auditOperation?: AuditOperationHandle): Promise<T> {
  return fetchV2Data<T>(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body), auditOperation });
}

export function patchData<T>(path: string, changes: object): Promise<T> {
  return fetchV2Data<T>(path, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(changes) });
}

export function putData<T>(path: string, body?: FormData, auditOperation?: AuditOperationHandle): Promise<T> {
  return fetchV2Data<T>(path, { method: "PUT", body, auditOperation });
}

export async function deleteRecord(path: string): Promise<void> {
  await fetchJson<void>(toApiUrl(path), { method: "DELETE" });
}
