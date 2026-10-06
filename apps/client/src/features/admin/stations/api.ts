import type { StationCreate, StationUpdate } from "@openbts/shared/contract";

import { STATION_INCLUDE } from "@/features/station-details/station/api";
import type { StationRecord } from "@/features/station-details/station/types";
import { type AuditOperationHandle, JSON_HEADERS, fetchV2Data } from "@/lib/api";

const STATION_QUERY = `include=${STATION_INCLUDE}`;

export function updateStation(stationId: number, body: StationUpdate): Promise<StationRecord> {
  return fetchV2Data<StationRecord>(`stations/${stationId}?${STATION_QUERY}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export function createStation(body: StationCreate, auditOperation?: AuditOperationHandle): Promise<StationRecord> {
  return fetchV2Data<StationRecord>(`stations?${STATION_QUERY}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    auditOperation,
  });
}
