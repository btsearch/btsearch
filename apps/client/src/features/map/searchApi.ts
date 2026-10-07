import type { Cell, Operator, Paging, SearchResult } from "@openbts/shared/contract";
import { queryOptions, skipToken } from "@tanstack/react-query";

import type { MapPlace } from "./data/mapPoints";
import type { StationLocationRecord } from "@/features/station-details/station/types";
import { EVERY_STATION_STATUS } from "@/features/station-details/station/utils/stations";
import { API_V2_BASE, ApiResponseError, fetchJson, postApiData } from "@/lib/api";
import { SEARCH_TEXT_MAX_LENGTH } from "@/lib/apiValues";
import type { Operator as V1Operator } from "@/types/station";

export type CoordinateBounds = readonly [readonly [west: number, south: number], readonly [east: number, north: number]];

export type GpsCoordinates = {
  lat: number;
  lng: number;
};

export type StationSearchHit = Omit<SearchResult, "operator" | "location" | "cells" | "sectors" | "backhaul"> & {
  operator: Operator | null;
  location: StationLocationRecord | null;
  cells: Cell[];
};

export type StationSearchResults = {
  hits: StationSearchHit[];
  total: number;
};

export type StationSearchHitLocation = StationLocationRecord & {
  stations: Omit<StationSearchHit, "location">[];
};

type StationSearchPage = {
  data: StationSearchHit[];
  paging: Paging;
};

type UkeSearchOperator = Omit<V1Operator, "mnc"> & { mnc: number | null };

export type UkeSearchPermit = {
  id: number;
  decision_number: string;
  decision_type: "zmP" | "P";
  expiry_date: string;
  band_id: number;
  source: "permits" | "device_registry";
  updatedAt: string;
  createdAt: string;
};

export type UkeSearchPermitStation = {
  id: number;
  station_id: string;
  operator: UkeSearchOperator | null;
  location: {
    id: number;
    region_id: number;
    city: string | null;
    address: string | null;
    longitude: number;
    latitude: number;
    updatedAt: string;
    createdAt: string;
  } | null;
  permits: UkeSearchPermit[];
};

export type UkeSearchRadioline = {
  id: number;
  permit_number: string;
  operator: { id: number; name: string; full_name: string } | null;
  tx: { city: string | null; latitude: number; longitude: number };
  rx: { city: string | null; latitude: number; longitude: number };
};

export type UkeSearchResult = {
  stations: UkeSearchPermitStation[];
  radiolines: UkeSearchRadioline[];
};

const GPS_REGEX = /([+-]?\d+\.\d+)[,\s]+\s*([+-]?\d+\.\d+)/;
const FULL_TURN_DEGREES = 360;
const STATION_SEARCH_LIMIT = 15;
const STATION_SEARCH_INCLUDE = "operator,location.region,cells.band";
const STATION_SEARCH_STALE_TIME = 1000 * 60 * 5;
const REJECTED_QUERY_STATUS = 400;

function isInsideBounds(lat: number, lng: number, [[west, south], [east, north]]: CoordinateBounds): boolean {
  if (lat < south || lat > north) return false;
  if (west > east) return lng >= west || lng <= east;
  return [lng - FULL_TURN_DEGREES, lng, lng + FULL_TURN_DEGREES].some((turned) => turned >= west && turned <= east);
}

export function parseGpsCoordinates(query: string, allowedBounds: CoordinateBounds | undefined): GpsCoordinates | null {
  const match = query.match(GPS_REGEX);
  if (!match) return null;
  const lat = Number.parseFloat(match[1]!);
  const lng = Number.parseFloat(match[2]!);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (allowedBounds !== undefined && !isInsideBounds(lat, lng, allowedBounds)) return null;
  return { lat, lng };
}

function toSearchText(query: string): string {
  return query.trim().slice(0, SEARCH_TEXT_MAX_LENGTH).trimEnd();
}

async function fetchStationSearch(text: string, signal?: AbortSignal): Promise<StationSearchResults> {
  const params = new URLSearchParams({
    q: text,
    statuses: EVERY_STATION_STATUS,
    include: STATION_SEARCH_INCLUDE,
    limit: String(STATION_SEARCH_LIMIT),
    includeTotal: "true",
  });
  const page = await fetchJson<StationSearchPage>(`${API_V2_BASE}/search?${params.toString()}`, { signal });
  return { hits: page.data, total: page.paging.total ?? page.data.length };
}

export function stationSearchQueryOptions(query: string) {
  const text = toSearchText(query);

  return queryOptions({
    queryKey: ["station-search", text, "internal", "v2"] as const,
    queryFn: text === "" ? skipToken : ({ signal }) => fetchStationSearch(text, signal),
    staleTime: STATION_SEARCH_STALE_TIME,
  });
}

export function isRejectedSearchQuery(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === REJECTED_QUERY_STATUS;
}

export function toSearchHitLocation(hit: StationSearchHit): StationSearchHitLocation | null {
  const { location, ...station } = hit;
  if (location === null) return null;
  return { ...location, stations: [station] };
}

export function toSearchHitPlace(location: StationLocationRecord): MapPlace {
  return {
    id: location.id,
    city: location.city,
    address: location.address,
    structure: location.structure,
    regionName: location.region.name,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export function searchUkePermits(query: string): Promise<UkeSearchResult> {
  return postApiData<UkeSearchResult, { query: string }>("uke/search", { query });
}
