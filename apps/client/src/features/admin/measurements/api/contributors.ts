import type {
  MeasurementContributor,
  MeasurementContributorList,
  MeasurementContributorUpdate,
  MeasurementDevice,
  MeasurementDeviceList,
  MeasurementDeviceUpdate,
} from "@openbts/shared/contract";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { type ContributorPageParams, measurementsAdminKeys } from "./keys";
import { API_V2_BASE, type AuditOperationHandle, JSON_HEADERS, NOT_FOUND_STATUS, fetchJson, fetchV2Data } from "@/lib/api";

const PERSON_DEVICES_LIMIT = 200;

function fetchContributorPage(params: ContributorPageParams, signal: AbortSignal): Promise<MeasurementContributorList> {
  const query = new URLSearchParams({ sort: params.sort, limit: String(params.limit), includeTotal: "true" });
  if (params.cursor !== null) query.set("cursor", params.cursor);
  return fetchJson<MeasurementContributorList>(`${API_V2_BASE}/measurements/contributors?${query.toString()}`, { signal });
}

async function fetchContributor(userId: string, signal: AbortSignal): Promise<MeasurementContributor | null> {
  const response = await fetchJson<{ data: MeasurementContributor } | null>(`${API_V2_BASE}/measurements/contributors/${userId}`, {
    signal,
    allowedErrors: [NOT_FOUND_STATUS],
  });
  return response?.data ?? null;
}

async function fetchPersonDevices(userId: string, signal: AbortSignal): Promise<MeasurementDevice[]> {
  const query = new URLSearchParams({ userIds: userId, sort: "-createdAt", limit: String(PERSON_DEVICES_LIMIT) });
  const page = await fetchJson<MeasurementDeviceList>(`${API_V2_BASE}/measurements/devices?${query.toString()}`, { signal });
  return page.data;
}

export function contributorPageQueryOptions(params: ContributorPageParams) {
  return queryOptions({
    queryKey: measurementsAdminKeys.contributorPage(params),
    queryFn: ({ signal }) => fetchContributorPage(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export function contributorQueryOptions(userId: string) {
  return queryOptions({
    queryKey: measurementsAdminKeys.contributor(userId),
    queryFn: ({ signal }) => fetchContributor(userId, signal),
    staleTime: 0,
  });
}

export function personDevicesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: measurementsAdminKeys.devices(userId),
    queryFn: ({ signal }) => fetchPersonDevices(userId, signal),
    staleTime: 0,
  });
}

export function updateContributor(
  userId: string,
  change: MeasurementContributorUpdate,
  auditOperation?: AuditOperationHandle,
): Promise<MeasurementContributor> {
  return fetchV2Data<MeasurementContributor>(`measurements/contributors/${userId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(change),
    auditOperation,
  });
}

export function updateDevice(deviceId: string, change: MeasurementDeviceUpdate): Promise<MeasurementDevice> {
  return fetchV2Data<MeasurementDevice>(`measurements/devices/${deviceId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(change) });
}
