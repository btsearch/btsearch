import type { Location, LocationStation, MicrowaveLink, OfficialLocation, Paging, Sector } from "@openbts/shared/contract";
import { queryOptions, skipToken } from "@tanstack/react-query";

import { formatV2Bbox, toV2Bbox } from "./data/mapBox";
import type { MapFilters } from "./data/mapFilters";
import { type MapListRequest, type MapLocationsQuery, buildMapLocationsQuery, buildMicrowaveLinkListParams } from "./data/mapRequests";
import { endpointPairKey } from "./utils";
import {
  type OfficialLocationListParams,
  fetchOfficialLocations,
  fetchOfficialMicrowaveLink,
  fetchOfficialMicrowaveLinks,
} from "@/features/official/api";
import { API_V2_BASE, fetchJson } from "@/lib/api";
import type { StationSource } from "@/types/station";

type StationInclude = "operator" | "cells" | "sectors" | "backhaul";

export type MapStationRecord = Omit<LocationStation, StationInclude> & { sectors?: Sector[] };
export type MapLocationRecord = Omit<Location, "region" | "stations"> & { stations: MapStationRecord[] };

export type MapLocationsPage =
  | { source: "internal"; locations: MapLocationRecord[]; total: number }
  | { source: "official"; locations: OfficialLocation[]; total: number };

export type MapLocationsFamily = "locations" | "list-locations";
type MapMicrowaveLinksFamily = "microwave-links" | "list-microwave-links";

type MapLocationList = {
  data: MapLocationRecord[];
  paging: Paging;
};

type MapLocationsQueryArgs = {
  bounds: string;
  request: MapListRequest;
  family?: MapLocationsFamily;
  scope?: object;
};

type MapMicrowaveLinksQueryArgs = {
  bounds: string;
  filters: Pick<MapFilters, "radiolineOperators" | "recentDays">;
  limit: number;
  family?: MapMicrowaveLinksFamily;
  listId?: string;
};

const MAP_LOCATIONS_SOURCE_KEY_INDEX = 2;
const MAP_LOCATIONS_STALE_TIME = 1000 * 60 * 2;
const MAP_MICROWAVE_LINKS_STALE_TIME = 1000 * 60 * 5;
const MAP_LOCATIONS_GC_TIME = 1000 * 60;
const MICROWAVE_LINK_GROUP_LIMIT = 1000;
const MICROWAVE_LINK_GROUP_COORDS_PADDING = 0.0005;

export const mapKeys = {
  locations: (family: MapLocationsFamily, bounds: string, source: StationSource, params: MapLocationsQuery["params"]) =>
    [family, bounds, source, params] as const,
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

async function fetchRegisterLocations(query: OfficialLocationListParams, signal?: AbortSignal): Promise<MapLocationsPage> {
  const list = await fetchOfficialLocations(query, signal);
  return { source: "official", locations: list.data, total: list.paging.total ?? list.data.length };
}

function createLocationsFetcher(bounds: string, query: MapLocationsQuery) {
  const bbox = toV2Bbox(bounds);
  if (bbox === null) return null;
  if (query.source === "official") {
    const registerParams = query.params;
    return registerParams === null ? null : (signal: AbortSignal) => fetchRegisterLocations({ ...registerParams, bbox }, signal);
  }

  const databaseParams = query.params;
  return databaseParams === null ? null : (signal: AbortSignal) => fetchMapLocations(bbox, databaseParams, signal);
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

export function mapMicrowaveLinksQueryOptions({ bounds, filters, limit, family = "microwave-links", listId }: MapMicrowaveLinksQueryArgs) {
  const params = buildMicrowaveLinkListParams(filters, limit, listId);
  const bbox = toV2Bbox(bounds);

  return queryOptions({
    queryKey: [family, bounds, params] as const,
    queryFn: bbox === null ? skipToken : ({ signal }) => fetchOfficialMicrowaveLinks({ ...params, bbox }, signal),
    staleTime: MAP_MICROWAVE_LINKS_STALE_TIME,
    gcTime: MAP_LOCATIONS_GC_TIME,
  });
}

function formatMicrowaveLinkEndpointsBbox(seed: MicrowaveLink): string {
  return formatV2Bbox({
    west: Math.min(seed.tx.longitude, seed.rx.longitude) - MICROWAVE_LINK_GROUP_COORDS_PADDING,
    south: Math.min(seed.tx.latitude, seed.rx.latitude) - MICROWAVE_LINK_GROUP_COORDS_PADDING,
    east: Math.max(seed.tx.longitude, seed.rx.longitude) + MICROWAVE_LINK_GROUP_COORDS_PADDING,
    north: Math.max(seed.tx.latitude, seed.rx.latitude) + MICROWAVE_LINK_GROUP_COORDS_PADDING,
  });
}

async function fetchMicrowaveLinkSiblings(seed: MicrowaveLink, signal?: AbortSignal): Promise<MicrowaveLink[]> {
  const permitNumber = seed.permit.number;
  const page = await fetchOfficialMicrowaveLinks(
    {
      permitNumbers: permitNumber === null ? undefined : [permitNumber],
      bbox: permitNumber === null ? formatMicrowaveLinkEndpointsBbox(seed) : undefined,
      licenseeIds: seed.licenseeId === null ? undefined : [seed.licenseeId],
      include: ["licensee"],
      limit: MICROWAVE_LINK_GROUP_LIMIT,
    },
    signal,
  );

  const licenseeLinks = page.data.filter((link) => link.licenseeId === seed.licenseeId);
  if (permitNumber !== null) return licenseeLinks.filter((link) => link.permit.number === permitNumber);

  const seedEndpoints = endpointPairKey(seed);
  return licenseeLinks.filter((link) => link.permit.number === null && endpointPairKey(link) === seedEndpoints);
}

export async function fetchMicrowaveLinkGroup(id: number, signal?: AbortSignal): Promise<MicrowaveLink[]> {
  const seed = await fetchOfficialMicrowaveLink(id, ["licensee"], signal);
  const siblings = await fetchMicrowaveLinkSiblings(seed, signal);
  return siblings.some((link) => link.id === seed.id) ? siblings : [seed, ...siblings];
}
