import { StationResponseSchema } from "@openbts/proto/gen/stations_pb";
import { PermitsResponseSchema as UKEPermitsResponseSchema } from "@openbts/proto/gen/uke_pb";

import { API_BASE, fetchApiData, fetchJson } from "@/lib/api";
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

export type StationHistoryAuthor = {
  id: string;
  name: string | null;
  username: string;
  image: string | null;
};

export type StationHistoryPhotoReference = { id: number; attachment_uuid: string };

export type StationHistoryEntry = {
  id: number;
  kind: "station" | "location" | "cells" | "sectors" | "network_ids" | "photos";
  action: "create" | "update" | "delete";
  createdAt: string;
  changes: StationHistoryChange[];
  author?: StationHistoryAuthor | null;
  photoReferences: StationHistoryPhotoReference[];
};

export type StationHistoryPage = {
  data: StationHistoryEntry[];
  nextCursor: number | null;
};

export const STATION_HISTORY_PAGE_SIZE = 25;

export const fetchStationHistory = (stationId: number, cursor: number | null, signal?: AbortSignal) =>
  fetchJson<StationHistoryPage>(
    `${API_BASE}/stations/${stationId}/history?limit=${STATION_HISTORY_PAGE_SIZE}${cursor !== null ? `&cursor=${cursor}` : ""}`,
    { signal },
  );
export const fetchUkeStation = (id: number) => fetchApiData<UkeStation>(`uke/stations/${id}`);
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

export type SI2PEMAntenna = {
  label: string | null;
  technology: string | null;
  frequencyMHz: number;
  tiltRange: { minimum: number; maximum: number } | null;
  measuredTilt: number | null;
  rowNumber: number | null;
  pageNumber: number;
  antenna: {
    model: string | null;
    manufacturer: string | null;
    mountedHeight: number;
    azimuth: number | null;
  };
  eirp: number | null;
  bandIndex: number;
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

export type StationPhoto = {
  id: number; // locationPhotos.id
  attachment_uuid: string;
  mime_type: string;
  is_main: boolean;
  note: string | null;
  taken_at: string | null;
  createdAt: string;
  author: { uuid: string; username: string; name: string } | null;
};

export type LocationPhoto = {
  id: number;
  attachment_uuid: string;
  mime_type: string;
  note: string | null;
  taken_at: string | null;
  createdAt: string;
  author: { uuid: string; username: string; name: string } | null;
};

export const fetchStationPhotos = (stationId: number) => fetchApiData<StationPhoto[]>(`stations/${stationId}/photos`);

export const fetchLocationPhotos = (locationId: number) => fetchApiData<LocationPhoto[]>(`locations/${locationId}/photos`);

export async function setStationPhotoSelection(stationId: number, selected: number[], mainId: number | null): Promise<void> {
  await fetchJson(`${API_BASE}/stations/${stationId}/photos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected, main_id: mainId }),
  });
}

export async function uploadLocationPhotos(locationId: number, files: File[]): Promise<LocationPhoto[]> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  const res = await fetchJson<{ data: LocationPhoto[] }>(`${API_BASE}/locations/${locationId}/photos`, { method: "POST", body: formData });
  return res.data;
}

export async function updateLocationPhotoNote(locationId: number, photoId: number, note: string): Promise<void> {
  await fetchJson(`${API_BASE}/locations/${locationId}/photos/${photoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

export async function updateLocationPhotoTakenAt(locationId: number, photoId: number, takenAt: string | null): Promise<void> {
  await fetchJson(`${API_BASE}/locations/${locationId}/photos/${photoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taken_at: takenAt }),
  });
}

export async function deleteLocationPhoto(locationId: number, photoId: number): Promise<void> {
  await fetchJson(`${API_BASE}/locations/${locationId}/photos/${photoId}`, { method: "DELETE" });
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
  selected,
  mainId,
  useFirstUploadedAsMain,
}: {
  locationId: number;
  stationId: number;
  files: File[];
  selected: number[];
  mainId: number | null;
  useFirstUploadedAsMain: boolean;
}): Promise<LocationPhoto[]> {
  const newPhotos = await uploadLocationPhotos(locationId, files);
  const newIds = newPhotos.map((photo) => photo.id);
  const nextSelected = [...new Set([...selected, ...newIds])];
  const nextMainId = useFirstUploadedAsMain ? (newIds[0] ?? mainId) : mainId;

  try {
    await setStationPhotoSelection(stationId, nextSelected, nextMainId);
  } catch (error) {
    await Promise.allSettled(newIds.map((id) => deleteLocationPhoto(locationId, id)));
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
