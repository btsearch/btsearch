import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";

import type { LocationRecord, PhotoRecord, PhotoUpdate, StationRecord } from "./types";
import { EVERY_STATION_STATUS } from "./utils/stations";
import { API_V2_BASE, type AuditOperationHandle, createAuditOperationHandle, fetchJson, fetchV2Data } from "@/lib/api";

type PhotoUploadDetails = {
  notes?: readonly string[];
  takenAts?: readonly (Date | null)[];
  onProgress?: (sent: number, total: number) => void;
  auditOperation?: AuditOperationHandle;
};

type StationPhotoUpload = PhotoUploadDetails & {
  locationId: number;
  stationId: number;
  files: readonly File[];
  photoIds: readonly string[];
  mainPhotoId: string | null;
  useFirstUploadedAsMain: boolean;
};

export const STATION_INCLUDE = "operator,location.region,cells.band,sectors,backhaul";
const LOCATION_INCLUDE = "region,stations,stations.operator,stations.cells,stations.cells.band,stations.sectors,stations.backhaul";
const RECORD_STALE_TIME = 1000 * 60 * 5;
const LOCATION_RECORD_STALE_TIME = 1000 * 60 * 2;

export const stationWindowKeys = {
  station: (stationId: number) => ["station", stationId, "internal", "v2"] as const,
  location: (locationId: number | null) => ["location", locationId, "v2", "stations"] as const,
  locationPhotos: (locationId: number | null) => ["location-photos", locationId, "v2"] as const,
  stationPhotos: (stationId: number) => ["station-photos", stationId, "v2"] as const,
};

function fetchStationRecord(stationId: number, signal?: AbortSignal): Promise<StationRecord> {
  return fetchV2Data<StationRecord>(`stations/${stationId}?include=${STATION_INCLUDE}`, { signal });
}

export function fetchLocationRecord(locationId: number, signal?: AbortSignal, cache?: RequestCache): Promise<LocationRecord> {
  return fetchV2Data<LocationRecord>(`locations/${locationId}?include=${LOCATION_INCLUDE}&statuses=${EVERY_STATION_STATUS}`, { signal, cache });
}

export function fetchLocationPhotoRecords(locationId: number, signal?: AbortSignal): Promise<PhotoRecord[]> {
  return fetchV2Data<PhotoRecord[]>(`locations/${locationId}/photos`, { signal });
}

function fetchStationPhotoRecords(stationId: number, signal?: AbortSignal): Promise<PhotoRecord[]> {
  return fetchV2Data<PhotoRecord[]>(`stations/${stationId}/photos`, { signal });
}

export function replaceStationPhotos(
  stationId: number,
  photoIds: readonly string[],
  mainPhotoId: string | null,
  auditOperation?: AuditOperationHandle,
): Promise<PhotoRecord[]> {
  return fetchV2Data<PhotoRecord[]>(`stations/${stationId}/photos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photoIds, mainPhotoId }),
    auditOperation,
  });
}

export function updateLocationPhotoRecord(locationId: number, photoId: string, changes: PhotoUpdate): Promise<PhotoRecord> {
  return fetchV2Data<PhotoRecord>(`locations/${locationId}/photos/${photoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export async function deleteLocationPhotoRecord(locationId: number, photoId: string, auditOperation?: AuditOperationHandle): Promise<void> {
  await fetchJson(`${API_V2_BASE}/locations/${locationId}/photos/${photoId}`, { method: "DELETE", auditOperation });
}

function removeUploadedPhotos(locationId: number, photos: readonly PhotoRecord[], auditOperation: AuditOperationHandle) {
  return Promise.allSettled(photos.map((photo) => deleteLocationPhotoRecord(locationId, photo.id, auditOperation)));
}

export async function uploadLocationPhotoRecords(
  locationId: number,
  files: readonly File[],
  { notes, takenAts, onProgress, auditOperation = createAuditOperationHandle() }: PhotoUploadDetails = {},
): Promise<PhotoRecord[]> {
  const uploaded: PhotoRecord[] = [];
  try {
    for (const [index, file] of files.entries()) {
      onProgress?.(index, files.length);
      const formData = new FormData();
      formData.append("notes", notes?.[index] ?? "");
      formData.append("takenAts", takenAts?.[index]?.toISOString() ?? "");
      formData.append("files", file);
      // oxlint-disable-next-line no-await-in-loop -- One photo per request keeps each upload under Cloudflare's body limit and the API timeout.
      const photos = await fetchV2Data<PhotoRecord[]>(`locations/${locationId}/photos`, { method: "POST", body: formData, auditOperation });
      uploaded.push(...photos);
    }
    onProgress?.(files.length, files.length);
  } catch (error) {
    await removeUploadedPhotos(locationId, uploaded, auditOperation);
    throw error;
  }
  return uploaded;
}

export async function uploadAndAssignStationPhotoRecords({
  locationId,
  stationId,
  files,
  photoIds,
  mainPhotoId,
  useFirstUploadedAsMain,
  auditOperation = createAuditOperationHandle(),
  ...uploadDetails
}: StationPhotoUpload): Promise<PhotoRecord[]> {
  const uploaded = await uploadLocationPhotoRecords(locationId, files, { ...uploadDetails, auditOperation });
  const uploadedIds = uploaded.map((photo) => photo.id);
  const nextPhotoIds = [...new Set([...photoIds, ...uploadedIds])];
  const nextMainPhotoId = useFirstUploadedAsMain ? (uploadedIds[0] ?? mainPhotoId) : mainPhotoId;

  try {
    return await replaceStationPhotos(stationId, nextPhotoIds, nextMainPhotoId, auditOperation);
  } catch (error) {
    await removeUploadedPhotos(locationId, uploaded, auditOperation);
    throw error;
  }
}

export function invalidatePhotoLists(queryClient: QueryClient, locationId: number, stationId: number): Promise<void[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["location-photos", locationId] }),
    queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] }),
  ]);
}

export function invalidateStationPhotoLists(queryClient: QueryClient, photo: Pick<PhotoRecord, "selections">): Promise<void[]> {
  return Promise.all(photo.selections.map(({ stationId }) => queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] })));
}

export function stationRecordQueryOptions(stationId: number) {
  return queryOptions({
    queryKey: stationWindowKeys.station(stationId),
    queryFn: ({ signal }) => fetchStationRecord(stationId, signal),
    staleTime: RECORD_STALE_TIME,
  });
}

export function locationRecordQueryOptions(locationId: number | null | undefined) {
  return queryOptions({
    queryKey: stationWindowKeys.location(locationId ?? null),
    queryFn: typeof locationId === "number" ? ({ signal }) => fetchLocationRecord(locationId, signal) : skipToken,
    staleTime: LOCATION_RECORD_STALE_TIME,
  });
}

export function canReplaceStationRecord(queryClient: QueryClient, stationId: number, updatedAt: number): boolean {
  const cachedState = queryClient.getQueryState<StationRecord>(stationWindowKeys.station(stationId));
  if (cachedState === undefined) return true;
  return !cachedState.isInvalidated && Math.max(cachedState.dataUpdatedAt, cachedState.errorUpdatedAt) < updatedAt;
}

export function seedStationRecord(queryClient: QueryClient, locationId: number, stationId: number): void {
  const locationState = queryClient.getQueryState<LocationRecord>(stationWindowKeys.location(locationId));
  const location = locationState?.data;
  if (locationState === undefined || location === undefined || locationState.isInvalidated) return;

  const updatedAt = locationState.dataUpdatedAt;
  if (!canReplaceStationRecord(queryClient, stationId, updatedAt)) return;

  const { stations, ...place } = location;
  const listed = stations.find((station) => station.id === stationId);
  if (listed === undefined) return;

  queryClient.setQueryData<StationRecord>(stationWindowKeys.station(stationId), { ...listed, location: place }, { updatedAt });
}

export function locationPhotoRecordsQueryOptions(locationId: number | null | undefined) {
  return queryOptions({
    queryKey: stationWindowKeys.locationPhotos(locationId ?? null),
    queryFn: typeof locationId === "number" ? ({ signal }) => fetchLocationPhotoRecords(locationId, signal) : skipToken,
    staleTime: RECORD_STALE_TIME,
  });
}

export function stationPhotoRecordsQueryOptions(stationId: number) {
  return queryOptions({
    queryKey: stationWindowKeys.stationPhotos(stationId),
    queryFn: ({ signal }) => fetchStationPhotoRecords(stationId, signal),
    staleTime: RECORD_STALE_TIME,
  });
}
