import type { Location, LocationUpdate } from "@openbts/shared/contract";

import { deleteRecord } from "@/features/admin/reference/api/request";
import { fetchLocationRecord } from "@/features/station-details/station/api";
import type { LocationRecord } from "@/features/station-details/station/types";
import { JSON_HEADERS, fetchV2Data } from "@/lib/api";
import type { AuditOperationHandle } from "@/lib/api";

export function fetchLocationDetail(id: number, signal?: AbortSignal): Promise<LocationRecord> {
  return fetchLocationRecord(id, signal, "no-store");
}

export function patchLocation(id: number, body: LocationUpdate, auditOperation?: AuditOperationHandle): Promise<Location> {
  return fetchV2Data<Location>(`locations/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    auditOperation,
  });
}

export function deleteLocation(id: number): Promise<void> {
  return deleteRecord(`locations/${id}`);
}
