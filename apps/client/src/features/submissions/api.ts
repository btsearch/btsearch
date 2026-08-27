import type { SubmissionDetail, SubmissionRow } from "@/features/admin/submissions/types";
import { getCellDetailDefaultValue, getCellDetailKeys } from "@/features/shared/rat";
import { API_BASE, fetchApiData, fetchJson, postApiData } from "@/lib/api";
import { type GeocodingResult, reverseGeocode as reverseGeocodeWithMapbox } from "@/lib/mapboxGeocoding";
import type {
  CellDetails,
  CellType,
  Location,
  LocationWithStations,
  Operator,
  Region,
  Sector,
  Station,
  UkeLocationWithPermits,
} from "@/types/station";

import type { CellFormDetails, RatType, SubmissionFormData } from "./types";

export { fetchOperators, fetchBands, fetchRegions } from "@/features/shared/api";

export type MySubmissionsResponse = { data: SubmissionRow[]; totalCount: number };

export type MySubmissionsFilters = {
  status?: "pending" | "approved" | "rejected";
  operatorMncs?: number[];
  search?: string;
};

export async function fetchMySubmissions(limit = 20, offset = 0, filters: MySubmissionsFilters = {}): Promise<MySubmissionsResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters.status) params.set("status", filters.status);
  if (filters.operatorMncs?.length) params.set("operators", filters.operatorMncs.join(","));
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  return fetchJson<MySubmissionsResponse>(`${API_BASE}/submissions?${params.toString()}`);
}

export type SearchCell = {
  id: number;
  rat: string;
  station_id: number;
  band_id: number;
  type: CellType | null;
  sector_id: number | null;
  notes: string | null;
  is_confirmed: boolean;
  updatedAt: string;
  createdAt: string;
  details: CellDetails;
};

export type SearchStation = {
  id: number;
  station_id: string;
  operator_id: number;
  notes: string | null;
  updatedAt: string;
  createdAt: string;
  is_confirmed: boolean;
  cells: SearchCell[];
  sectors?: Sector[];
  location: (Location & { region: Region }) | null;
  operator: Operator | null;
  extra_identificators?: { networks_id: number | null; networks_name: string | null; mno_name: string | null } | null;
};

export async function searchStations(query: string): Promise<SearchStation[]> {
  if (!query || query.length < 2) return [];
  return postApiData<SearchStation[], { query: string }>("search", { query });
}

export type { GeocodingResult };

export async function reverseGeocode(lat: number, lon: number): Promise<GeocodingResult | null> {
  try {
    return await reverseGeocodeWithMapbox(lat, lon);
  } catch {
    return null;
  }
}

export async function fetchLocationsInViewport(
  bounds: string,
  options?: { orphaned?: boolean; azimuths?: boolean },
): Promise<LocationWithStations[]> {
  const params = new URLSearchParams({ bounds, limit: "500" });
  if (options?.orphaned) params.set("orphaned", "true");
  if (options?.azimuths) params.set("azimuths", "true");
  return fetchApiData<LocationWithStations[]>(`locations?${params.toString()}`);
}

export async function fetchUkeLocationsInViewport(bounds: string, options?: { azimuths?: boolean }): Promise<UkeLocationWithPermits[]> {
  const params = new URLSearchParams({ bounds, limit: "500" });
  if (options?.azimuths) params.set("azimuths", "true");
  return fetchApiData<UkeLocationWithPermits[]>(`uke/locations?${params.toString()}`);
}

export type SubmissionResponse = {
  id: string;
  station_id: number | null;
  submitter_id: string;
  status: "pending" | "approved" | "rejected";
  type: "new" | "update" | "delete";
  pending_photos: number | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchStationForSubmission(id: number): Promise<SearchStation> {
  const station = await fetchApiData<Station>(`stations/${id}`);
  return {
    id: station.id,
    station_id: station.station_id,
    operator_id: station.operator?.id ?? null,
    notes: station.notes,
    updatedAt: station.updatedAt,
    createdAt: station.createdAt,
    is_confirmed: station.is_confirmed,
    cells: station.cells.map((cell) => ({
      id: cell.id,
      rat: cell.rat,
      station_id: cell.station_id,
      band_id: cell.band.id,
      type: cell.type,
      notes: cell.notes,
      is_confirmed: cell.is_confirmed,
      updatedAt: cell.updatedAt,
      createdAt: cell.createdAt,
      details: cell.details,
      sector_id: cell.sector_id,
    })),
    sectors: station.sectors,
    location: station.location,
    operator: station.operator,
    extra_identificators: station.extra_identificators
      ? {
          networks_id: station.extra_identificators.networks_id,
          networks_name: station.extra_identificators.networks_name,
          mno_name: station.extra_identificators.mno_name,
        }
      : null,
  };
}

export function pickCellDetails(rat: RatType | undefined, details: Partial<CellFormDetails> | undefined): Partial<CellFormDetails> | undefined {
  if (!details) return undefined;
  if (!rat) return details;

  const detailKeys = getCellDetailKeys(rat);
  if (detailKeys.length === 0) return details;

  const picked: Record<string, unknown> = {};
  for (const key of detailKeys) {
    if (key in details) picked[key] = (details as Record<string, unknown>)[key];
    else picked[key] = getCellDetailDefaultValue(rat, key);
  }

  return picked as Partial<CellFormDetails>;
}

function buildSubmissionPayload(data: SubmissionFormData): Record<string, unknown> {
  const payload: Record<string, unknown> = { type: data.type };

  if (data.station_id) payload.station_id = data.station_id;
  if (data.submitter_note) payload.submitter_note = data.submitter_note;
  if (data.station) {
    const { networks_id, networks_name, mno_name, ...stationBase } = data.station;
    const hasAnyExtraIdField = "networks_id" in data.station || "networks_name" in data.station || "mno_name" in data.station;
    payload.station = {
      ...stationBase,
      ...(hasAnyExtraIdField ? { networks_id: networks_id ?? null, networks_name: networks_name ?? null, mno_name: mno_name ?? null } : {}),
    };
  }
  if (data.location) payload.location = data.location;
  if (data.sectors && data.sectors.length > 0) payload.sectors = data.sectors;
  if (data.cells.length > 0) {
    payload.cells = data.cells.map((cell) => ({
      operation: cell.operation,
      target_cell_id: cell.target_cell_id,
      target_sector_id: cell.target_sector_id,
      sector_local_id: cell.sector_local_id,
      sector_unassigned: cell.sector_unassigned,
      band_id: cell.band_id,
      rat: cell.rat,
      type: cell.type ?? null,
      notes: cell.notes,
      details: pickCellDetails(cell.rat, cell.details),
    }));
  }
  if (data.pending_photos) payload.pending_photos = data.pending_photos;
  if (data.location_photo_ids?.length) payload.location_photo_ids = data.location_photo_ids;
  if (data.location_photo_ids_to_remove?.length) payload.location_photo_ids_to_remove = data.location_photo_ids_to_remove;
  if (data.main_location_photo_id !== undefined) payload.main_location_photo_id = data.main_location_photo_id;

  return payload;
}

export async function createSubmission(data: SubmissionFormData): Promise<SubmissionResponse> {
  const results = await postApiData<SubmissionResponse[]>("submissions", buildSubmissionPayload(data));
  return results[0];
}

export async function createAnalyzerBatch(payloads: SubmissionFormData[], submitterNote?: string): Promise<SubmissionResponse[]> {
  return postApiData<SubmissionResponse[]>("submissions/batch", {
    submitter_note: submitterNote?.trim() || undefined,
    items: payloads.map(buildSubmissionPayload),
  });
}

export async function updateSubmission(id: string, data: SubmissionFormData): Promise<SubmissionResponse> {
  return fetchApiData<SubmissionResponse>(`submissions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSubmissionPayload(data)),
  });
}

export async function deleteSubmission(id: string): Promise<void> {
  await fetchJson(`${API_BASE}/submissions/${id}`, { method: "DELETE" });
}

export async function fetchSiblingExtraIds(stationId: number) {
  return fetchJson<{ data: { networks_id: number | null; networks_name: string | null; mno_name: string | null } }>(
    `${API_BASE}/stations/${stationId}/extra-identifiers/sibling`,
  );
}

export async function fetchSiblingSectors(stationId: number) {
  return fetchJson<{ data: Sector[] }>(`${API_BASE}/stations/${stationId}/sectors/sibling`);
}

export async function fetchSubmissionForEdit(id: string) {
  return fetchApiData<SubmissionDetail>(`submissions/${id}`);
}

export type SubmissionPhoto = {
  id: number;
  attachment_uuid: string;
  mime_type: string;
  note: string | null;
  taken_at: string | null;
  is_main: boolean;
  createdAt: string;
  author: { uuid: string; username: string; name: string } | null;
};

export async function fetchSubmissionPhotos(submissionId: string): Promise<SubmissionPhoto[]> {
  return fetchApiData<SubmissionPhoto[]>(`submissions/${submissionId}/photos`);
}

export async function deleteSubmissionPhoto(submissionId: string, photoId: number): Promise<void> {
  await fetchJson(`${API_BASE}/submissions/${submissionId}/photos/${photoId}`, { method: "DELETE" });
}

export async function updateSubmissionPhotoNote(submissionId: string, photoId: number, note: string): Promise<void> {
  await fetchJson(`${API_BASE}/submissions/${submissionId}/photos/${photoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

export async function updateSubmissionPhotoTakenAt(submissionId: string, photoId: number, takenAt: string | null): Promise<void> {
  await fetchJson(`${API_BASE}/submissions/${submissionId}/photos/${photoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taken_at: takenAt }),
  });
}

export async function uploadSubmissionPhotos(
  submissionId: string,
  files: File[],
  notes?: string[],
  takenAts?: (string | null)[],
  mainPhotoIndex?: number | null,
): Promise<void> {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("notes", notes?.[i] ?? "");
    formData.append("takenAts", takenAts?.[i] ?? "");
    formData.append("isMains", String(i === mainPhotoIndex));
    formData.append("files", files[i]);
  }
  await fetchJson(`${API_BASE}/submissions/${submissionId}/photos`, {
    method: "POST",
    body: formData,
  });
}

export async function applyAnalyzerBatch(payload: SubmissionFormData[]): Promise<{ station_id: number; applied: number }[]> {
  return postApiData<{ station_id: number; applied: number }[]>("analyzer/apply", {
    items: payload.map((data) => ({
      station_id: data.station_id,
      cells: data.cells.map((cell) => ({
        operation: cell.operation,
        target_cell_id: cell.target_cell_id,
        band_id: cell.band_id,
        rat: cell.rat,
        details: pickCellDetails(cell.rat, cell.details),
      })),
    })),
  });
}
