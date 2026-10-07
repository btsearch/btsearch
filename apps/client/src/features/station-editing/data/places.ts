import type { Region } from "@openbts/shared/contract";
import { keepPreviousData, queryOptions, skipToken } from "@tanstack/react-query";

import { COORDINATE_DIGITS, formatCoordinate } from "../model/changes";
import { EDIT_LIMITS } from "../model/validate";
import { editingKeys } from "./keys";
import type { MapLocationRecord } from "@/features/map/api";
import { fetchApiData, fetchV2Data } from "@/lib/api";
import type { PlacePoint } from "@/lib/geo/geocoding";
import type { UkeLocationWithPermits } from "@/types/station";

export type PickerLocation = MapLocationRecord;
export type PickerStation = PickerLocation["stations"][number];

const PICKER_PAGE_SIZE = 500;
const PICKER_INCLUDE = "stations";
const PICKER_STALE_TIME = 1000 * 60 * 2;
const REGION_AT_STALE_TIME = 1000 * 60 * 30;
const COORDINATE_SCALE = 10 ** COORDINATE_DIGITS;

export function roundCoordinate(value: number): number {
  return Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE;
}

export function toPlacePoint(latitude: number | null, longitude: number | null): PlacePoint | null {
  if (latitude === null || longitude === null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > EDIT_LIMITS.latitude || Math.abs(longitude) > EDIT_LIMITS.longitude) return null;
  return { latitude, longitude };
}

function fetchPickerLocations(bbox: string, includeEmpty: boolean, wantsAzimuths: boolean, signal?: AbortSignal): Promise<PickerLocation[]> {
  const params = new URLSearchParams({
    bbox,
    limit: String(PICKER_PAGE_SIZE),
    include: wantsAzimuths ? `${PICKER_INCLUDE},stations.sectors` : PICKER_INCLUDE,
  });
  if (includeEmpty) params.set("includeEmpty", "true");
  return fetchV2Data<PickerLocation[]>(`locations?${params.toString()}`, { signal });
}

async function fetchRegionAt(point: PlacePoint, signal?: AbortSignal): Promise<Region | null> {
  const params = new URLSearchParams({
    latitude: formatCoordinate(point.latitude),
    longitude: formatCoordinate(point.longitude),
  });
  const regions = await fetchV2Data<Region[]>(`regions?${params.toString()}`, { signal });
  return regions[0] ?? null;
}

function fetchRegisterLocations(bounds: string, wantsAzimuths: boolean, signal?: AbortSignal): Promise<UkeLocationWithPermits[]> {
  const params = new URLSearchParams({ bounds, limit: String(PICKER_PAGE_SIZE) });
  if (wantsAzimuths) params.set("azimuths", "true");
  return fetchApiData<UkeLocationWithPermits[]>(`uke/locations?${params.toString()}`, { signal });
}

export function pickerLocationsQueryOptions(bbox: string, includeEmpty: boolean, wantsAzimuths = false) {
  return queryOptions({
    queryKey: [...editingKeys.pickerLocations(bbox, includeEmpty), wantsAzimuths],
    queryFn: bbox === "" ? skipToken : ({ signal }) => fetchPickerLocations(bbox, includeEmpty, wantsAzimuths, signal),
    staleTime: PICKER_STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function regionAtQueryOptions(point: PlacePoint | null) {
  const latitude = point === null ? null : roundCoordinate(point.latitude);
  const longitude = point === null ? null : roundCoordinate(point.longitude);

  return queryOptions({
    queryKey: editingKeys.regionAt(latitude, longitude),
    queryFn: latitude === null || longitude === null ? skipToken : ({ signal }) => fetchRegionAt({ latitude, longitude }, signal),
    staleTime: REGION_AT_STALE_TIME,
  });
}

export function registerLocationsQueryOptions(bounds: string, wantsAzimuths: boolean) {
  return queryOptions({
    queryKey: editingKeys.registerLocations(bounds, wantsAzimuths),
    queryFn: bounds === "" ? skipToken : ({ signal }) => fetchRegisterLocations(bounds, wantsAzimuths, signal),
    staleTime: PICKER_STALE_TIME,
    placeholderData: keepPreviousData,
  });
}
