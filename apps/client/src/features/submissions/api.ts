import type { CellFormDetails, RatType, SubmissionFormData } from "./types";
import type { PhotoFileFields } from "@/components/photos/photoFiles";
import type { SubmissionDetail, SubmissionRow } from "@/features/admin/submissions/types";
import { getCellDetailDefaultValue, getCellDetailKeys } from "@/features/shared/rat";
import { API_BASE, fetchApiData, fetchJson, postApiData } from "@/lib/api";
import {
  type GeocodingResult,
  type GeocodingSource,
  type ReverseGeocodingResponse,
  reverseGeocode as requestReverseGeocode,
} from "@/lib/geo/geocoding";
import type {
  Band,
  CellDetails,
  CellType,
  Location,
  LocationWithStations,
  Operator,
  Region,
  Sector,
  Station,
  UkeLocationWithPermits,
  UplinkType,
} from "@/types/station";

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
  band: Band;
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
  extra_address: string | null;
  updatedAt: string;
  createdAt: string;
  is_confirmed: boolean;
  cells: SearchCell[];
  sectors?: Sector[];
  location: (Location & { region: Region }) | null;
  operator: Operator | null;
  extra_identificators?: { networks_id: number | null; networks_name: string | null; mno_name: string | null } | null;
  uplink?: { type: UplinkType; speed: number | null; model: string | null } | null;
};

export async function searchStations(query: string): Promise<SearchStation[]> {
  if (!query || query.length < 2) return [];
  return postApiData<SearchStation[], { query: string }>("search", { query });
}

export type { GeocodingResult, GeocodingSource };

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodingResponse | null> {
  return requestReverseGeocode(lat, lon).catch(() => null);
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
    extra_address: station.extra_address,
    updatedAt: station.updatedAt,
    createdAt: station.createdAt,
    is_confirmed: station.is_confirmed,
    cells: station.cells.map((cell) => ({
      id: cell.id,
      rat: cell.rat,
      station_id: cell.station_id,
      band_id: cell.band.id,
      band: cell.band,
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
    uplink: station.uplink ?? null,
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

function buildSubmissionPayload(data: SubmissionFormData, preservePartialCellDetails = false): Record<string, unknown> {
  const payload: Record<string, unknown> = { type: data.type };

  if (data.station_id) payload.station_id = data.station_id;
  if (data.submitter_note) payload.submitter_note = data.submitter_note;
  if (data.station) payload.station = data.station;
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
      ...(cell.type === undefined ? {} : { type: cell.type }),
      notes: cell.notes,
      details: preservePartialCellDetails ? cell.details : pickCellDetails(cell.rat, cell.details),
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
    items: payloads.map((payload) => buildSubmissionPayload(payload, true)),
  });
}

export async function updateSubmission(id: string, data: SubmissionFormData): Promise<SubmissionResponse> {
  const payload = buildSubmissionPayload(data);
  return fetchApiData<SubmissionResponse>(`submissions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, cells: payload.cells ?? [], sectors: data.sectors }),
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

export type SubmissionPhoto = PhotoFileFields & {
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
  onProgress?: (sent: number, total: number) => void,
): Promise<void> {
  // The main photo goes last: its upload clears is_main on other photos, which the rollback below could not restore
  const uploadOrder = [...files.keys()].filter((index) => index !== mainPhotoIndex);
  if (typeof mainPhotoIndex === "number" && mainPhotoIndex < files.length) uploadOrder.push(mainPhotoIndex);
  const uploadedIds: number[] = [];
  try {
    for (const [sent, index] of uploadOrder.entries()) {
      onProgress?.(sent, uploadOrder.length);
      const formData = new FormData();
      formData.append("notes", notes?.[index] ?? "");
      formData.append("takenAts", takenAts?.[index] ?? "");
      formData.append("isMains", String(index === mainPhotoIndex));
      formData.append("files", files[index]);
      // oxlint-disable-next-line no-await-in-loop -- One photo per request keeps each upload under Cloudflare's body limit and the API timeout.
      const res = await fetchJson<{ data: { id: number }[] }>(`${API_BASE}/submissions/${submissionId}/photos`, {
        method: "POST",
        body: formData,
      });
      uploadedIds.push(...res.data.map((photo) => photo.id));
    }
    onProgress?.(uploadOrder.length, uploadOrder.length);
  } catch (error) {
    await Promise.allSettled(uploadedIds.map((photoId) => deleteSubmissionPhoto(submissionId, photoId)));
    throw error;
  }
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
        ...(cell.type === undefined ? {} : { type: cell.type }),
        details: cell.details,
      })),
    })),
  });
}
