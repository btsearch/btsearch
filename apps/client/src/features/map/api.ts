import type { Location, LocationStation, Paging, Sector } from "@openbts/shared/contract";
import { queryOptions, skipToken } from "@tanstack/react-query";

import { toV2Bbox } from "./data/mapBox";
import { type MapListRequest, type MapLocationsQuery, buildMapLocationsQuery } from "./data/mapRequests";
import { endpointPairKey } from "./utils";
import { API_BASE, API_V2_BASE, fetchJson } from "@/lib/api";
import type { Band, RadioLine, StationSource, UkeLocationWithPermits, UkePermit } from "@/types/station";

type StationInclude = "operator" | "cells" | "sectors" | "backhaul";

export type MapStationRecord = Omit<LocationStation, StationInclude> & { sectors?: Sector[] };
export type MapLocationRecord = Omit<Location, "region" | "stations"> & { stations: MapStationRecord[] };

export type MapLocationsPage =
  | { source: "internal"; locations: MapLocationRecord[]; total: number }
  | { source: "uke"; locations: UkeLocationWithPermits[]; total: number };

export type MapLocationsFamily = "locations" | "list-locations";

type MapLocationList = {
  data: MapLocationRecord[];
  paging: Paging;
};

type RegisterLocationList = {
  data: UkeLocationWithPermits[];
  totalCount: number;
};

type MapLocationsQueryArgs = {
  bounds: string;
  request: MapListRequest;
  family?: MapLocationsFamily;
  scope?: object;
};

const MAP_LOCATIONS_SOURCE_KEY_INDEX = 2;
const MAP_LOCATIONS_STALE_TIME = 1000 * 60 * 2;
const REGISTER_BANDS_STALE_TIME = 1000 * 60 * 5;
const MAP_LOCATIONS_GC_TIME = 1000 * 60;

export const mapKeys = {
  locations: (family: MapLocationsFamily, bounds: string, source: StationSource, params: string | null) => [family, bounds, source, params] as const,
};

export function hasMapLocationsSource(queryKey: readonly unknown[], source: StationSource): boolean {
  return queryKey[MAP_LOCATIONS_SOURCE_KEY_INDEX] === source;
}

async function fetchMapLocations(bbox: string, params: string, signal?: AbortSignal): Promise<MapLocationsPage> {
  const search = new URLSearchParams(params);
  search.set("bbox", bbox);
  const list = await fetchJson<MapLocationList>(`${API_V2_BASE}/locations?${search.toString()}`, { signal });
  return { source: "internal", locations: list.data, total: list.paging.total ?? list.data.length };
}

async function fetchRegisterLocations(bounds: string, params: string, signal?: AbortSignal): Promise<MapLocationsPage> {
  const search = new URLSearchParams(params);
  search.set("bounds", bounds);
  const list = await fetchJson<RegisterLocationList>(`${API_BASE}/uke/locations?${search.toString()}`, { signal });
  return { source: "uke", locations: list.data, total: list.totalCount };
}

function createLocationsFetcher(bounds: string, query: MapLocationsQuery) {
  const { source, params } = query;
  if (bounds === "" || params === null) return null;
  if (source === "uke") return (signal: AbortSignal) => fetchRegisterLocations(bounds, params, signal);

  const bbox = toV2Bbox(bounds);
  return bbox === null ? null : (signal: AbortSignal) => fetchMapLocations(bbox, params, signal);
}

export function mapLocationsQueryOptions({ bounds, request, family = "locations", scope }: MapLocationsQueryArgs) {
  const query = buildMapLocationsQuery(request);
  const sourceKey = mapKeys.locations(family, bounds, query.source, query.params);
  const fetchPage = createLocationsFetcher(bounds, query);

  return queryOptions({
    queryKey: scope === undefined ? sourceKey : ([...sourceKey, scope] as const),
    queryFn: fetchPage === null ? skipToken : ({ signal }) => fetchPage(signal),
    staleTime: MAP_LOCATIONS_STALE_TIME,
    gcTime: MAP_LOCATIONS_GC_TIME,
  });
}

export async function fetchUkePermitsByStationId(stationId: string, operator?: number | null): Promise<UkePermit[]> {
  const params = new URLSearchParams();
  params.set("station_id", stationId);
  if (operator !== null && operator !== undefined) params.set("operator", String(operator));
  const result = await fetchJson<{ data: UkePermit[] }>(`${API_BASE}/uke/permits?${decodeURIComponent(params.toString())}`);
  return result.data;
}

export function registerBandsQueryOptions() {
  return queryOptions({
    queryKey: ["uke-bands"] as const,
    queryFn: async ({ signal }) => {
      const result = await fetchJson<{ data: Band[] }>(`${API_BASE}/uke/bands`, { signal });
      return result.data;
    },
    staleTime: REGISTER_BANDS_STALE_TIME,
  });
}

export function listRegisterBandLabels(registerBands: readonly Band[]): number[] {
  const labels = new Set(registerBands.map((band) => band.value).filter((value) => value > 0));
  return [...labels].sort((left, right) => left - right);
}

export type RadioLinesResponse = {
  data: RadioLine[];
  totalCount: number;
};

type FetchRadioLinesOptions = {
  signal?: AbortSignal;
  operatorIds?: number[];
  limit?: number;
  page?: number;
  recentDays?: number | null;
  permitNumber?: string;
  list?: string;
};

export async function fetchRadioLines(bounds?: string, options?: FetchRadioLinesOptions): Promise<RadioLinesResponse> {
  const params = new URLSearchParams();
  if (bounds) params.set("bounds", bounds);
  params.set("limit", String(options?.limit ?? 500));
  if (options?.page) params.set("page", String(options.page));
  if (options?.operatorIds?.length) params.set("operators", options.operatorIds.join(","));
  if (options?.recentDays) params.set("new", String(options.recentDays));
  if (options?.permitNumber) params.set("permit_number", options.permitNumber);
  if (options?.list) params.set("list", options.list);

  return fetchJson<RadioLinesResponse>(`${API_BASE}/uke/radiolines?${params.toString()}`, {
    signal: options?.signal,
  });
}

export async function fetchRadioLine(id: number, signal?: AbortSignal): Promise<RadioLine> {
  const result = await fetchJson<{ data: RadioLine }>(`${API_BASE}/uke/radiolines/${id}`, { signal });
  return result.data;
}

const RADIO_LINE_GROUP_PAGE_LIMIT = 1000;
const RADIO_LINE_GROUP_MAX_PAGES = 5;
const RADIO_LINE_GROUP_COORDS_PADDING = 0.0005;

function formatRadioLineEndpointsBounds(seed: RadioLine): string {
  const south = Math.min(seed.tx.latitude, seed.rx.latitude) - RADIO_LINE_GROUP_COORDS_PADDING;
  const north = Math.max(seed.tx.latitude, seed.rx.latitude) + RADIO_LINE_GROUP_COORDS_PADDING;
  const west = Math.min(seed.tx.longitude, seed.rx.longitude) - RADIO_LINE_GROUP_COORDS_PADDING;
  const east = Math.max(seed.tx.longitude, seed.rx.longitude) + RADIO_LINE_GROUP_COORDS_PADDING;
  return `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;
}

async function fetchRadioLinePermitPages(
  permitNumber: string,
  operatorId: number | undefined,
  signal: AbortSignal | undefined,
  page = 1,
): Promise<RadioLine[]> {
  const response = await fetchRadioLines(undefined, {
    signal,
    operatorIds: operatorId === undefined ? undefined : [operatorId],
    permitNumber,
    limit: RADIO_LINE_GROUP_PAGE_LIMIT,
    page,
  });
  const matchingLines = response.data.filter(
    (line) => line.permit.number === permitNumber && (operatorId === undefined || line.operator?.id === operatorId),
  );

  if (page >= RADIO_LINE_GROUP_MAX_PAGES || response.data.length < RADIO_LINE_GROUP_PAGE_LIMIT) return matchingLines;

  return [...matchingLines, ...(await fetchRadioLinePermitPages(permitNumber, operatorId, signal, page + 1))];
}

export async function fetchRadioLineGroup(id: number, signal?: AbortSignal): Promise<RadioLine[]> {
  const seed = await fetchRadioLine(id, signal);
  const permitNumber = seed.permit.number;
  const operatorId = seed.operator?.id;
  const matchingLines: RadioLine[] = [];

  if (permitNumber) {
    matchingLines.push(...(await fetchRadioLinePermitPages(permitNumber, operatorId, signal)));
  } else {
    const response = await fetchRadioLines(formatRadioLineEndpointsBounds(seed), {
      signal,
      operatorIds: operatorId === undefined ? undefined : [operatorId],
      limit: RADIO_LINE_GROUP_PAGE_LIMIT,
    });
    matchingLines.push(
      ...response.data.filter(
        (line) =>
          !line.permit.number && endpointPairKey(line) === endpointPairKey(seed) && (operatorId === undefined || line.operator?.id === operatorId),
      ),
    );
  }

  if (matchingLines.some((line) => line.id === seed.id)) return matchingLines;
  return [seed, ...matchingLines];
}
