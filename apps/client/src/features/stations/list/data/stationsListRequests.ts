import type { Paging, SearchMatch, StationSort } from "@openbts/shared/contract";
import { queryOptions, skipToken } from "@tanstack/react-query";

import { clampListPageSize, getListOffset } from "./listPaging";
import { setListParam } from "./listRequestParams";
import { LIST_STATION_STATUSES, isDefaultListStationStatuses } from "./listStationStatuses";
import { LIST_STRUCTURE_TYPES, UNKNOWN_STRUCTURE_TYPE_WORD } from "./listStructures";
import { orderWords, sortUniqueCountryCodes, sortUniqueNumbers } from "./listUrlValues";
import { DEFAULT_STATIONS_LIST_SORT, type StationsListFilters, type StationsListSort, type StationsListVariant } from "./stationsListFilters";
import { IOT_RAT } from "@/features/map/data/mapFilters";
import type { MapLookups } from "@/features/map/data/mapLookups";
import { listBandFilterEntries, listCellRats, setOperatorParams, setRecentParams } from "@/features/map/data/mapRequests";
import { parseFilters } from "@/features/map/filters";
import { STATION_INCLUDE } from "@/features/station-details/station/api";
import type { StationRecord } from "@/features/station-details/station/types";
import { API_V2_BASE, fetchJson } from "@/lib/api";
import { normalizeSearchText } from "@/lib/apiValues";
import { UPLINK_TYPES } from "@/lib/format/uplink";

type StationsListRoute = "stations" | "search";

type StationsListRequestInput = {
  filters: StationsListFilters;
  variant: StationsListVariant;
  pageSize: number;
  lookups: MapLookups | undefined;
};

type StationsListRequest = {
  route: StationsListRoute;
  params: string;
  searchText: string;
  isByRelevance: boolean;
};

export type StationsListHit = {
  station: StationRecord;
  match: SearchMatch | null;
};

export type StationsListPageData = {
  hits: StationsListHit[];
  total: number;
  rowCount: number;
  freeText: string;
  isByRelevance: boolean;
  loadedAt: number;
};

type StationsListAnswer = {
  data: (StationRecord & { match?: SearchMatch | null })[];
  paging: Paging;
};

const PAGE_STALE_TIME = 1000 * 60 * 5;
const QUERY_FAMILIES: Record<StationsListRoute, string> = { stations: "stations-list", search: "station-search-table" };
const V2_SORTS: Record<StationsListSort, StationSort> = {
  siteId: "siteId",
  "-siteId": "-siteId",
  updated: "updatedAt",
  "-updated": "-updatedAt",
  created: "createdAt",
  "-created": "-createdAt",
};

function listStructureTypeEntries(filters: StationsListFilters, variant: StationsListVariant): string[] {
  const types: string[] = orderWords(LIST_STRUCTURE_TYPES, filters.structureTypes);
  return variant === "admin" && filters.missing.includes("structure") ? [...types, UNKNOWN_STRUCTURE_TYPE_WORD] : types;
}

function setEditorParams(params: URLSearchParams, filters: StationsListFilters): void {
  if (filters.missing.includes("photos")) params.set("hasPhotos", "false");
  if (filters.missing.includes("sectors")) params.set("hasSectors", "false");
  if (filters.missing.includes("unconfirmed")) params.set("isConfirmed", "false");
  params.set("editableOnly", "true");
}

function setStationFilterParams(params: URLSearchParams, filters: StationsListFilters, variant: StationsListVariant): void {
  if (!isDefaultListStationStatuses(filters.statuses)) setListParam(params, "statuses", orderWords(LIST_STATION_STATUSES, filters.statuses));
  setListParam(params, "countryCodes", sortUniqueCountryCodes(filters.countryCodes));
  setOperatorParams(params, sortUniqueNumbers(filters.operatorIds));
  setListParam(params, "regionIds", sortUniqueNumbers(filters.regionIds));
  setListParam(params, "rats", listCellRats(filters.rats));
  if (filters.rats.includes(IOT_RAT)) params.set("supportsIot", "true");
  setListParam(params, "structureTypes", listStructureTypeEntries(filters, variant));
  setListParam(params, "backhaulMediums", orderWords(UPLINK_TYPES, filters.uplinkTypes));
  setRecentParams(params, filters);
  if (variant === "admin") setEditorParams(params, filters);
}

export function buildStationsListRequest({ filters, variant, pageSize, lookups }: StationsListRequestInput): StationsListRequest | null {
  const bandEntries = listBandFilterEntries(filters.bands, lookups?.bands);
  if (bandEntries === null) return null;

  const searchText = normalizeSearchText(filters.searchText);
  const isSearch = searchText !== "";
  const sort = filters.sort ?? (isSearch ? null : DEFAULT_STATIONS_LIST_SORT);
  const limit = clampListPageSize(pageSize);
  const offset = getListOffset(filters.page, limit);
  const params = new URLSearchParams();

  if (isSearch) params.set("q", searchText);
  setStationFilterParams(params, filters, variant);
  setListParam(params, "bandIds", bandEntries);
  params.set("include", STATION_INCLUDE);
  if (sort !== null) params.set("sort", V2_SORTS[sort]);
  params.set("limit", String(limit));
  if (offset > 0) params.set("offset", String(offset));
  params.set("includeTotal", "true");

  return {
    route: isSearch ? "search" : "stations",
    params: params.toString(),
    searchText,
    isByRelevance: sort === null,
  };
}

async function fetchStationsListPage(request: StationsListRequest, signal?: AbortSignal): Promise<StationsListPageData> {
  const answer = await fetchJson<StationsListAnswer>(`${API_V2_BASE}/${request.route}?${request.params}`, { signal });
  const hits = answer.data.map(({ match = null, ...station }): StationsListHit => ({ station, match }));

  return {
    hits,
    total: answer.paging.total ?? hits.length,
    rowCount: hits.length,
    freeText: request.searchText === "" ? "" : parseFilters(request.searchText).remainingText,
    isByRelevance: request.isByRelevance,
    loadedAt: Date.now(),
  };
}

export function stationsListPageQueryOptions(request: StationsListRequest | null) {
  return queryOptions({
    queryKey: [QUERY_FAMILIES[request?.route ?? "stations"], "v2", request?.params ?? null] as const,
    queryFn: request === null ? skipToken : ({ signal }) => fetchStationsListPage(request, signal),
    staleTime: PAGE_STALE_TIME,
  });
}
