import type {
  Me,
  MeasurementContentType,
  MeasurementDevice,
  MeasurementDeviceList,
  MeasurementDeviceUpdate,
  MeasurementListing,
  MeasurementListingUpdate,
  MeasurementSummary,
  MeasurementTerms,
  MeasurementTermsAccept,
  MeasurementUpload,
  MeasurementUploadList,
  MeasurementUploadUpdate,
  MeasurementUploadsLimit,
  MeasurementWithdrawal,
  MeasurementWithdrawalResult,
} from "@openbts/shared/contract";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { API_V2_BASE, ApiResponseError, JSON_HEADERS, fetchJson, fetchV2Data } from "@/lib/api";
import { meQueryOptions } from "@/lib/auth/me";
import { downloadBlob } from "@/lib/dom/download";

const DEVICES_LIMIT = 50;
const UPLOADS_PAGE_SIZE = 10;

const UPLOAD_FILE_EXTENSIONS: Record<MeasurementContentType, string> = {
  "application/zstd": "json.zst",
  "application/gzip": "json.gz",
};

export function measurementDeviceHardwareName({ hardware }: MeasurementDevice): string {
  return `${hardware.manufacturer} ${hardware.model}`;
}

export function measurementDeviceName(device: MeasurementDevice): string {
  return device.label ?? measurementDeviceHardwareName(device);
}

function readMeasurementUploadsLimit(me: Me): MeasurementUploadsLimit | null {
  return me.limits.measurementUploads;
}

async function fetchMeasurementDevices(signal: AbortSignal): Promise<MeasurementDevice[]> {
  const params = new URLSearchParams({ limit: String(DEVICES_LIMIT), sort: "-createdAt" });
  const page = await fetchJson<MeasurementDeviceList>(`${API_V2_BASE}/measurements/devices?${params.toString()}`, { signal });
  return page.data;
}

function fetchMeasurementUploadsPage(cursor: string | null, signal: AbortSignal): Promise<MeasurementUploadList> {
  const params = new URLSearchParams({ limit: String(UPLOADS_PAGE_SIZE), sort: "-receivedAt" });
  if (cursor === null) params.set("includeTotal", "true");
  else params.set("cursor", cursor);
  return fetchJson<MeasurementUploadList>(`${API_V2_BASE}/measurements/uploads?${params.toString()}`, { signal });
}

export function measurementTermsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["measurements", "terms", userId] as const,
    queryFn: ({ signal }) => fetchV2Data<MeasurementTerms>("measurements/terms", { signal }),
  });
}

export function measurementDevicesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["measurements", "devices", userId] as const,
    queryFn: ({ signal }) => fetchMeasurementDevices(signal),
  });
}

export function measurementUploadsQueryOptions(userId: string) {
  return infiniteQueryOptions({
    queryKey: ["measurements", "uploads", userId] as const,
    queryFn: ({ pageParam, signal }) => fetchMeasurementUploadsPage(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.paging.nextCursor,
  });
}

export function measurementSummaryQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["measurements", "summary", userId] as const,
    queryFn: ({ signal }) => fetchV2Data<MeasurementSummary>("measurements/summary", { signal }),
  });
}

export function measurementListingQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["measurements", "listing", userId] as const,
    queryFn: ({ signal }) => fetchV2Data<MeasurementListing>("measurements/listing", { signal }),
  });
}

export function measurementUploadsLimitQueryOptions(userId: string) {
  return queryOptions({ ...meQueryOptions(userId), select: readMeasurementUploadsLimit });
}

export async function revokeMeasurementDevice(deviceId: string): Promise<void> {
  const change: MeasurementDeviceUpdate = { isRevoked: true };
  await fetchJson(`${API_V2_BASE}/measurements/devices/${deviceId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(change) });
}

export async function withdrawMeasurementUpload(uploadId: string): Promise<void> {
  const change: MeasurementUploadUpdate = { status: "withdrawn" };
  await fetchJson(`${API_V2_BASE}/measurements/uploads/${uploadId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(change) });
}

export async function withdrawAllMeasurementUploads(): Promise<number> {
  const withdrawal: MeasurementWithdrawal = { all: true };
  const result = await fetchV2Data<MeasurementWithdrawalResult["data"]>("measurements/uploads/withdrawals", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(withdrawal),
  });
  return result.withdrawnCount;
}

export function acceptMeasurementTerms(version: number): Promise<MeasurementTerms> {
  const accept: MeasurementTermsAccept = { version };
  return fetchV2Data<MeasurementTerms>("measurements/terms", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(accept) });
}

export function updateMeasurementListing(isListed: boolean): Promise<MeasurementListing> {
  const update: MeasurementListingUpdate = { isListed };
  return fetchV2Data<MeasurementListing>("measurements/listing", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(update) });
}

export async function downloadMeasurementUploadFile(upload: MeasurementUpload): Promise<void> {
  const response = await fetch(`${API_V2_BASE}/measurements/uploads/${upload.id}/file`, { credentials: "include" });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    if (errorData?.errors?.length) throw new ApiResponseError(response.status, errorData.errors);
    throw new Error(`Download failed: ${response.status}`);
  }

  downloadBlob(await response.blob(), `${upload.id}.${UPLOAD_FILE_EXTENSIONS[upload.contentType]}`);
}
