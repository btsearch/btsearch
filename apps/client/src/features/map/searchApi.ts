import type {
  Cell,
  MicrowaveLink,
  MicrowaveLinkInclude,
  OfficialSite,
  OfficialSiteInclude,
  Operator,
  Paging,
  SearchResult,
} from "@openbts/shared/contract";
import { queryOptions, skipToken } from "@tanstack/react-query";

import type { MapPlace } from "./data/mapPoints";
import { fetchOfficialMicrowaveLinks, fetchOfficialSites } from "@/features/official/api";
import type { StationLocationRecord } from "@/features/station-details/station/types";
import { EVERY_STATION_STATUS } from "@/features/station-details/station/utils/stations";
import { API_V2_BASE, ApiResponseError, fetchJson } from "@/lib/api";
import { SEARCH_TEXT_MAX_LENGTH } from "@/lib/apiValues";

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

type OfficialSearchResults = {
  sites: OfficialSite[];
  microwaveLinks: MicrowaveLink[];
};

const GPS_REGEX = /([+-]?\d+\.\d+)[,\s]+\s*([+-]?\d+\.\d+)/;
const FULL_TURN_DEGREES = 360;
const STATION_SEARCH_LIMIT = 15;
const STATION_SEARCH_INCLUDE = "operator,location.region,cells.band";
const STATION_SEARCH_STALE_TIME = 1000 * 60 * 5;
const REJECTED_QUERY_STATUS = 400;
const OFFICIAL_SITE_SEARCH_LIMIT = 20;
const OFFICIAL_SITE_SEARCH_INCLUDE: OfficialSiteInclude[] = ["location", "permits"];
const MICROWAVE_LINK_SEARCH_LIMIT = 20;
const MICROWAVE_LINK_SEARCH_PAGE_SIZE = 100;
const MICROWAVE_LINK_SEARCH_INCLUDE: MicrowaveLinkInclude[] = ["licensee"];

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

function compareMicrowaveLinkSearchHits(left: MicrowaveLink, right: MicrowaveLink): number {
  return (left.permit.number ?? "").localeCompare(right.permit.number ?? "") || left.id - right.id;
}

export function listMicrowaveLinkSearchHits(links: readonly MicrowaveLink[]): MicrowaveLink[] {
  const hitsByPermit = new Map<string, MicrowaveLink>();
  for (const link of links) {
    const permitKey = link.permit.number ?? `link:${link.id}`;
    if (!hitsByPermit.has(permitKey)) hitsByPermit.set(permitKey, link);
  }
  return [...hitsByPermit.values()].sort(compareMicrowaveLinkSearchHits).slice(0, MICROWAVE_LINK_SEARCH_LIMIT);
}

async function fetchOfficialSearch(text: string, signal?: AbortSignal): Promise<OfficialSearchResults> {
  const [sites, microwaveLinks] = await Promise.all([
    fetchOfficialSites({ q: text, include: OFFICIAL_SITE_SEARCH_INCLUDE, limit: OFFICIAL_SITE_SEARCH_LIMIT }, signal),
    fetchOfficialMicrowaveLinks({ q: text, include: MICROWAVE_LINK_SEARCH_INCLUDE, limit: MICROWAVE_LINK_SEARCH_PAGE_SIZE }, signal),
  ]);
  return { sites: sites.data, microwaveLinks: listMicrowaveLinkSearchHits(microwaveLinks.data) };
}

export function officialSearchQueryOptions(query: string) {
  const text = toSearchText(query);

  return queryOptions({
    queryKey: ["official-search", text] as const,
    queryFn: text === "" ? skipToken : ({ signal }) => fetchOfficialSearch(text, signal),
    staleTime: STATION_SEARCH_STALE_TIME,
  });
}
