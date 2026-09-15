import { API_BASE, fetchJson } from "@/lib/api";
import type { AuditOperationHandle } from "@/lib/api";
import type { Cell, Sector, Station } from "@/types/station";

export async function patchStation(stationId: number, body: Record<string, unknown>, auditOperation?: AuditOperationHandle) {
  return fetchJson<{ data: Station }>(`${API_BASE}/stations/${stationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    auditOperation,
  });
}

export async function patchCell(stationId: number, cellId: number, body: Record<string, unknown>) {
  return fetchJson<{ data: Cell }>(`${API_BASE}/stations/${stationId}/cells/${cellId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchCells(
  stationId: number,
  cellsData: Array<{ cell_id: number } & Record<string, unknown>>,
  auditOperation?: AuditOperationHandle,
) {
  return fetchJson<{ data: Cell[] }>(`${API_BASE}/stations/${stationId}/cells`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells: cellsData }),
    auditOperation,
  });
}

export async function createCells(stationId: number, cellsData: Record<string, unknown>[], auditOperation?: AuditOperationHandle) {
  return fetchJson<{ data: Cell[] }>(`${API_BASE}/stations/${stationId}/cells`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells: cellsData }),
    auditOperation,
  });
}

export async function deleteCell(stationId: number, cellId: number, auditOperation?: AuditOperationHandle) {
  return fetchJson<void>(`${API_BASE}/stations/${stationId}/cells/${cellId}`, {
    method: "DELETE",
    auditOperation,
  });
}

export async function createLocation(
  body: { region_id: number; city?: string; address?: string; longitude: number; latitude: number },
  auditOperation?: AuditOperationHandle,
) {
  return fetchJson<{ data: { id: number } }>(`${API_BASE}/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    auditOperation,
  });
}

export async function deleteStation(stationId: number) {
  return fetchJson<void>(`${API_BASE}/stations/${stationId}`, {
    method: "DELETE",
  });
}

export async function createStation(body: Record<string, unknown>, auditOperation?: AuditOperationHandle) {
  return fetchJson<{ data: Station }>(`${API_BASE}/stations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    auditOperation,
  });
}

export async function fetchSiblingExtraIds(stationId: number) {
  return fetchJson<{ data: { networks_id: number | null; networks_name: string | null; mno_name: string | null } }>(
    `${API_BASE}/stations/${stationId}/extra-identifiers/sibling`,
  );
}

export async function updateExtraIds(
  stationId: number,
  body: { networks_id?: number | null; networks_name?: string | null; mno_name?: string | null },
  auditOperation?: AuditOperationHandle,
) {
  return fetchJson<{ data: { id: number; networks_id: number | null; networks_name: string | null; mno_name: string | null } }>(
    `${API_BASE}/stations/${stationId}/extra-identifiers`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      auditOperation,
    },
  );
}

export async function getStationSectors(stationId: number) {
  return fetchJson<{ data: Sector[] }>(`${API_BASE}/stations/${stationId}/sectors`);
}

export async function fetchSiblingSectors(stationId: number) {
  return fetchJson<{ data: Sector[] }>(`${API_BASE}/stations/${stationId}/sectors/sibling`);
}

export async function putStationSectors(stationId: number, sectors: { id?: number; azimuth: number }[], auditOperation?: AuditOperationHandle) {
  return fetchJson<{ data: Sector[] }>(`${API_BASE}/stations/${stationId}/sectors`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sectors }),
    auditOperation,
  });
}
