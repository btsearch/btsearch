import { StationResponseSchema } from "@openbts/proto/gen/stations_pb";
import { PermitsResponseSchema as UKEPermitsResponseSchema } from "@openbts/proto/gen/uke_pb";

import type { PhotoFileFields } from "@/components/photos/photoFiles";
import { API_BASE, createAuditOperationHandle, fetchApiData, fetchJson } from "@/lib/api";
import type { AuditOperationHandle } from "@/lib/api";
import type { Station, UkePermit, UkeStation } from "@/types/station";

export const fetchStation = (id: number) => fetchApiData<Station>(`stations/${id}`, { proto: StationResponseSchema });

export type StationHistoryValue = string | number | boolean | null;
export type StationHistoryChangeValue = StationHistoryValue | StationHistoryValue[] | Record<string, StationHistoryValue>;

export type StationHistoryChange = {
  field: string;
  label?: string;
  rat?: string;
  from: StationHistoryChangeValue;
  to: StationHistoryChangeValue;
};

type StationHistoryAuthor = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
};

export type StationHistoryPhotoReference = { id: number; attachment_uuid: string; has_thumb: boolean };

export type StationHistorySection = {
  kind: "station" | "location" | "cells" | "sectors" | "network_ids" | "uplink" | "photos";
  action: "create" | "update" | "delete";
  changes: StationHistoryChange[];
};

export type StationHistoryItem = StationHistorySection & {
  id: number;
  operationId: number;
  createdAt: string;
  author?: StationHistoryAuthor | null;
  entryIds: number[];
  revertible: boolean;
  revertStatus: "none" | "partial" | "complete";
  isRevert: boolean;
  photoReferences: StationHistoryPhotoReference[];
};

type StationHistoryPage = {
  data: StationHistoryItem[];
  nextCursor: number | null;
};

const STATION_HISTORY_PAGE_SIZE = 25;

export const fetchStationHistory = (stationId: number, cursor: number | null, signal?: AbortSignal) =>
  fetchJson<StationHistoryPage>(
    `${API_BASE}/stations/${stationId}/history?limit=${STATION_HISTORY_PAGE_SIZE}${cursor !== null ? `&cursor=${cursor}` : ""}`,
    { signal },
  );
export const fetchUkeStation = (id: number) => fetchApiData<UkeStation>(`uke/stations/${id}`);
export const fetchStationPermits = (stationId: number) =>
  fetchApiData<UkePermit[]>(`stations/${stationId}/permits`, { allowedErrors: [404] }).then((permits) => permits ?? []);
export const fetchUkePermit = (id: string) => fetchApiData<UkePermit[]>(`uke/permits?station_id=${id}`, { proto: UKEPermitsResponseSchema });
export const fetchStationWatch = (stationId: number, source: "internal" | "uke" = "internal") =>
  fetchApiData<{ watched: boolean }>(source === "uke" ? `uke/stations/${stationId}/watch` : `stations/${stationId}/watch`);

type PemReportDetails =
  | {
      document_url: string;
      lab_name: string;
    }
  | {
      document_url: string;
      installation_document: string;
      lab_name: string;
    };

export type PemReport = {
  station_id: string;
  source: "map" | "search";
  date: string;
  type: "planned_measurement" | "map_measurement" | "search_measurement";
  antenna_data_available: boolean;
  details: PemReportDetails;
};

export const fetchPemReports = (stationId: string, lat: number, lng: number, operator: number) =>
  fetchApiData<PemReport[]>(`pem/${stationId}?lat=${lat}&lng=${lng}&operator=${operator}`);

export type SI2PEMAntennaBand = {
  label: string | null;
  rat: string | null;
  value: number;
  eirp: number | null;
  tiltRange: { minimum: number; maximum: number } | null;
  measuredTilt: number | null;
};

export type SI2PEMAntenna = {
  rowNumber: number | null;
  pageNumber: number;
  antenna: {
    model: string | null;
    manufacturer: string | null;
    mountedHeight: number;
    azimuth: number | null;
  };
  totalEirp: number | null;
  bands: SI2PEMAntennaBand[];
};

export type FetchSI2PEMAntennasRequest = {
  stationId: string;
  latitude: number;
  longitude: number;
  reportUrl: string;
};

export const fetchSI2PEMAntennas = ({ stationId, latitude, longitude, reportUrl }: FetchSI2PEMAntennasRequest) => {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude), report_url: reportUrl });
  return fetchApiData<SI2PEMAntenna[]>(`pem/${encodeURIComponent(stationId)}/antennas?${params.toString()}`);
};

export type StationPhoto = PhotoFileFields & {
  id: number; // locationPhotos.id
  attachment_uuid: string;
  mime_type: string;
  is_main: boolean;
  note: string | null;
  taken_at: string | null;
  createdAt: string;
  author: { uuid: string; username: string; name: string; image?: string | null } | null;
};

export type LocationPhoto = PhotoFileFields & {
  id: number;
  attachment_uuid: string;
  mime_type: string;
  note: string | null;
  taken_at: string | null;
  createdAt: string;
  author: { uuid: string; username: string; name: string; image?: string | null } | null;
};

export type UploadedPhoto = PhotoFileFields & { id: number; attachment_uuid: string; mime_type: string; createdAt: string };

export const fetchStationPhotos = (stationId: number) => fetchApiData<StationPhoto[]>(`stations/${stationId}/photos`);

export const fetchLocationPhotos = (locationId: number) => fetchApiData<LocationPhoto[]>(`locations/${locationId}/photos`);

export async function setStationPhotoSelection(
  stationId: number,
  selected: number[],
  mainId: number | null,
  auditOperation?: AuditOperationHandle,
): Promise<void> {
  await fetchJson(`${API_BASE}/stations/${stationId}/photos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected, main_id: mainId }),
    auditOperation,
  });
}

export async function uploadLocationPhotos(
  locationId: number,
  files: File[],
  auditOperation?: AuditOperationHandle,
  onProgress?: (sent: number, total: number) => void,
  notes?: string[],
  takenAts?: (Date | null)[],
): Promise<UploadedPhoto[]> {
  const uploaded: UploadedPhoto[] = [];
  try {
    for (const [index, file] of files.entries()) {
      onProgress?.(index, files.length);
      const formData = new FormData();
      formData.append("notes", notes?.[index] ?? "");
      formData.append("takenAts", takenAts?.[index]?.toISOString() ?? "");
      formData.append("files", file);
      // oxlint-disable-next-line no-await-in-loop -- One photo per request keeps each upload under Cloudflare's body limit and the API timeout.
      const res = await fetchJson<{ data: UploadedPhoto[] }>(`${API_BASE}/locations/${locationId}/photos`, {
        method: "POST",
        body: formData,
        auditOperation,
      });
      uploaded.push(...res.data);
    }
    onProgress?.(files.length, files.length);
  } catch (error) {
    await Promise.allSettled(uploaded.map((photo) => deleteLocationPhoto(locationId, photo.id, auditOperation)));
    throw error;
  }
  return uploaded;
}

export async function updateLocationPhotoNote(
  locationId: number,
  photoId: number,
  note: string,
  auditOperation?: AuditOperationHandle,
): Promise<void> {
  await fetchJson(`${API_BASE}/locations/${locationId}/photos/${photoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
    auditOperation,
  });
}

export async function updateLocationPhotoTakenAt(
  locationId: number,
  photoId: number,
  takenAt: string | null,
  auditOperation?: AuditOperationHandle,
): Promise<void> {
  await fetchJson(`${API_BASE}/locations/${locationId}/photos/${photoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taken_at: takenAt }),
    auditOperation,
  });
}

export async function deleteLocationPhoto(locationId: number, photoId: number, auditOperation?: AuditOperationHandle): Promise<void> {
  await fetchJson(`${API_BASE}/locations/${locationId}/photos/${photoId}`, { method: "DELETE", auditOperation });
}

export async function watchStation(stationId: number, source: "internal" | "uke" = "internal"): Promise<void> {
  const path = source === "uke" ? `uke/stations/${stationId}/watch` : `stations/${stationId}/watch`;
  await fetchJson(`${API_BASE}/${path}`, { method: "POST" });
}

export async function unwatchStation(stationId: number, source: "internal" | "uke" = "internal"): Promise<void> {
  const path = source === "uke" ? `uke/stations/${stationId}/watch` : `stations/${stationId}/watch`;
  await fetchJson(`${API_BASE}/${path}`, { method: "DELETE" });
}

export async function uploadAndAssignStationPhotos({
  locationId,
  stationId,
  files,
  notes,
  takenAts,
  selected,
  mainId,
  useFirstUploadedAsMain,
  onProgress,
}: {
  locationId: number;
  stationId: number;
  files: File[];
  notes?: string[];
  takenAts?: (Date | null)[];
  selected: number[];
  mainId: number | null;
  useFirstUploadedAsMain: boolean;
  onProgress?: (sent: number, total: number) => void;
}): Promise<UploadedPhoto[]> {
  const auditOperation = createAuditOperationHandle("station.photos");
  const newPhotos = await uploadLocationPhotos(locationId, files, auditOperation, onProgress, notes, takenAts);
  const newIds = newPhotos.map((photo) => photo.id);
  const nextSelected = [...new Set([...selected, ...newIds])];
  const nextMainId = useFirstUploadedAsMain ? (newIds[0] ?? mainId) : mainId;

  try {
    await setStationPhotoSelection(stationId, nextSelected, nextMainId, auditOperation);
  } catch (error) {
    await Promise.allSettled(newIds.map((id) => deleteLocationPhoto(locationId, id, auditOperation)));
    throw error;
  }

  return newPhotos;
}

export async function fetchElevation(latitude: number, longitude: number): Promise<number> {
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`);
  if (!res.ok) throw new Error("Failed to fetch elevation");
  const data = (await res.json()) as { elevation: number[] };
  return data.elevation[0];
}
