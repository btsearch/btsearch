import { LocationResponseSchema, LocationsResponseSchema } from "@openbts/proto/gen/locations_pb";
import { PermitsResponseSchema as UKEPermitsResponseSchema } from "@openbts/proto/gen/uke_pb";

import { API_BASE, fetchJson } from "@/lib/api";
import type { LocationWithStations, RadioLine, StationFilters, UkeLocationWithPermits, UkePermit } from "@/types/station";

import { endpointPairKey } from "./utils";

export type LocationsResponse = {
  data: LocationWithStations[];
  totalCount: number;
};

export type UkeLocationsResponse = {
  data: UkeLocationWithPermits[];
  totalCount: number;
};

function buildFilterParams(filters: StationFilters): URLSearchParams {
  const params = new URLSearchParams();

  const { operators, bands, rat, status, recentDays, recentDateFields } = filters;
  if (operators.length) params.set("operators", operators.join(","));
  if (bands.length) params.set("bands", bands.join(","));
  if (rat.length) params.set("rat", rat.join(","));
  if (filters.source === "internal" && status.length) params.set("status", status.join(","));
  if (recentDays !== null && (filters.source === "internal" || filters.source === "uke"))
    params.set("since", `${recentDateFields.join(",")}:${recentDays}`);

  return params;
}

export function locationQueryKey(locationId: number, filters: StationFilters) {
  return ["location", locationId, buildFilterParams(filters).toString()] as const;
}

export async function fetchLocations(
  bounds: string,
  filters: StationFilters,
  limit = 1000,
  options?: { azimuths?: boolean; q?: string },
): Promise<LocationsResponse> {
  if (filters.source === "uke") {
    const params = buildFilterParams(filters);
    params.set("limit", String(limit));
    params.set("bounds", bounds);
    if (options?.azimuths) params.set("azimuths", "true");
    const result = await fetchJson<UkeLocationsResponse>(`${API_BASE}/uke/locations?${decodeURIComponent(params.toString())}`, {
      // proto: UKELocationsResponseSchema,
    });
    return { data: result.data as unknown as LocationWithStations[], totalCount: result.totalCount };
  }

  const params = buildFilterParams(filters);
  params.set("limit", String(limit));
  params.set("bounds", bounds);
  if (options?.q) params.set("q", options.q);
  if (options?.azimuths) params.set("azimuths", "true");

  const result = await fetchJson<LocationsResponse>(`${API_BASE}/locations?${decodeURIComponent(params.toString())}`, {
    proto: LocationsResponseSchema,
  });
  return { data: result.data ?? [], totalCount: result.totalCount ?? 0 };
}

export async function fetchLocationWithStations(locationId: number, filters: StationFilters): Promise<LocationWithStations> {
  const params = buildFilterParams(filters);
  const filter = params.toString() === "" ? "" : `?${decodeURIComponent(params.toString())}`;
  const result = await fetchJson<{ data: LocationWithStations }>(`${API_BASE}/locations/${locationId}${filter}`, {
    proto: LocationResponseSchema,
  });
  return {
    ...result.data,
    stations: result.data.stations.map((station) => ({
      ...station,
      cells: station.cells ?? [],
    })),
  };
}

export async function fetchUkePermitsByStationId(stationId: string, operator?: number | null): Promise<UkePermit[]> {
  const params = new URLSearchParams();
  params.set("station_id", stationId);
  if (operator !== null && operator !== undefined) params.set("operator", String(operator));
  const result = await fetchJson<{ data: UkePermit[] }>(`${API_BASE}/uke/permits?${decodeURIComponent(params.toString())}`, {
    proto: UKEPermitsResponseSchema,
  });
  return result.data;
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
};

export async function fetchRadioLines(bounds?: string, options?: FetchRadioLinesOptions): Promise<RadioLinesResponse> {
  const params = new URLSearchParams();
  if (bounds) params.set("bounds", bounds);
  params.set("limit", String(options?.limit ?? 500));
  if (options?.page) params.set("page", String(options.page));
  if (options?.operatorIds?.length) params.set("operators", options.operatorIds.join(","));
  if (options?.recentDays) params.set("new", String(options.recentDays));
  if (options?.permitNumber) params.set("permit_number", options.permitNumber);

  return fetchJson<RadioLinesResponse>(`${API_BASE}/uke/radiolines?${params.toString()}`, {
    signal: options?.signal,
    // proto: UKERadiolinesResponseSchema,
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
