import type {
  MeasurementExclusion,
  MeasurementExclusionResult,
  MeasurementUpload,
  MeasurementUploadList,
  MeasurementUploadUpdate,
} from "@openbts/shared/contract";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { type UploadPageParams, measurementsAdminKeys } from "./keys";
import { API_V2_BASE, type AuditOperationHandle, JSON_HEADERS, appendList, fetchJson, fetchV2Data } from "@/lib/api";

function fetchUploadPage(params: UploadPageParams, signal: AbortSignal): Promise<MeasurementUploadList> {
  const query = new URLSearchParams({
    scope: "all",
    include: "uploader,device",
    sort: "-receivedAt",
    limit: String(params.limit),
    includeTotal: "true",
  });
  appendList(query, "statuses", params.statuses);
  if (params.userId !== null) query.set("userIds", params.userId);
  if (params.cursor !== null) query.set("cursor", params.cursor);
  return fetchJson<MeasurementUploadList>(`${API_V2_BASE}/measurements/uploads?${query.toString()}`, { signal });
}

function updateUpload(uploadId: string, change: MeasurementUploadUpdate): Promise<MeasurementUpload> {
  return fetchV2Data<MeasurementUpload>(`measurements/uploads/${uploadId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(change) });
}

export function uploadPageQueryOptions(params: UploadPageParams) {
  return queryOptions({
    queryKey: measurementsAdminKeys.uploadPage(params),
    queryFn: ({ signal }) => fetchUploadPage(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export function excludeUpload(uploadId: string, reason: string): Promise<MeasurementUpload> {
  return updateUpload(uploadId, { exclusion: { reason } });
}

export function restoreUpload(uploadId: string): Promise<MeasurementUpload> {
  return updateUpload(uploadId, { exclusion: null });
}

export async function excludeContributorUploads(userId: string, reason: string, auditOperation?: AuditOperationHandle): Promise<number> {
  const exclusion: MeasurementExclusion = { userId, reason };
  const result = await fetchV2Data<MeasurementExclusionResult["data"]>("measurements/uploads/exclusions", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(exclusion),
    auditOperation,
  });
  return result.excludedCount;
}
