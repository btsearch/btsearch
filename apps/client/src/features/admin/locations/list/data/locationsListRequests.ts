import type { Location, LocationSort, LocationStation, Operator, Paging, Region } from "@openbts/shared/contract";
import { queryOptions, skipToken } from "@tanstack/react-query";

import type { LocationsListFilters, LocationsListSort } from "./locationsListFilters";
import { setOperatorParams } from "@/features/map/data/mapRequests";
import { EVERY_STATION_STATUS } from "@/features/station-details/station/utils/stations";
import { clampListPageSize, getListOffset } from "@/features/stations/list/data/listPaging";
import { setListParam } from "@/features/stations/list/data/listRequestParams";
import { LIST_STRUCTURE_TYPES } from "@/features/stations/list/data/listStructures";
import { orderWords, sortUniqueCountryCodes, sortUniqueNumbers } from "@/features/stations/list/data/listUrlValues";
import { API_V2_BASE, fetchJson } from "@/lib/api";
import { normalizeSearchText } from "@/lib/apiValues";

type LocationsListRequestInput = {
  filters: LocationsListFilters;
  pageSize: number;
};

type LocationsListRequest = {
  params: string;
};

export type LocationsListStationRecord = Omit<LocationStation, "operator" | "cells" | "sectors" | "backhaul"> & {
  operator: Operator | null;
};

export type LocationsListRecord = Omit<Location, "region" | "stations"> & {
  region: Region;
  stations: LocationsListStationRecord[];
};

export type LocationsListPageData = {
  locations: LocationsListRecord[];
  total: number;
  rowCount: number;
};

type LocationsAnswer = {
  data: LocationsListRecord[];
  paging: Paging;
};

const QUERY_FAMILY = "admin-locations-list";
const LOCATION_INCLUDE = "region,stations,stations.operator";
const PAGE_STALE_TIME = 1000 * 60 * 5;
const V2_SORTS: Record<LocationsListSort, LocationSort> = {
  id: "id",
  "-id": "-id",
  updated: "updatedAt",
  "-updated": "-updatedAt",
  created: "createdAt",
  "-created": "-createdAt",
};

export function buildLocationsListRequest({ filters, pageSize }: LocationsListRequestInput): LocationsListRequest {
  const searchText = normalizeSearchText(filters.searchText);
  const limit = clampListPageSize(pageSize);
  const offset = getListOffset(filters.page, limit);
  const params = new URLSearchParams();

  if (searchText !== "") params.set("q", searchText);
  params.set("statuses", EVERY_STATION_STATUS);
  setListParam(params, "countryCodes", sortUniqueCountryCodes(filters.countryCodes));
  setOperatorParams(params, sortUniqueNumbers(filters.operatorIds));
  setListParam(params, "regionIds", sortUniqueNumbers(filters.regionIds));
  setListParam(params, "structureTypes", orderWords(LIST_STRUCTURE_TYPES, filters.structureTypes));
  setListParam(params, "structureOwnerIds", sortUniqueNumbers(filters.structureOwnerIds));
  params.set("includeEmpty", "true");
  if (filters.isWithoutStations) params.set("hasStations", "false");
  params.set("editableOnly", "true");
  params.set("include", LOCATION_INCLUDE);
  params.set("sort", V2_SORTS[filters.sort]);
  params.set("limit", String(limit));
  if (offset > 0) params.set("offset", String(offset));
  params.set("includeTotal", "true");

  return { params: params.toString() };
}

async function fetchLocationsListPage(request: LocationsListRequest, signal?: AbortSignal): Promise<LocationsListPageData> {
  const answer = await fetchJson<LocationsAnswer>(`${API_V2_BASE}/locations?${request.params}`, { signal });
  return { locations: answer.data, total: answer.paging.total ?? answer.data.length, rowCount: answer.data.length };
}

export function locationsListPageQueryOptions(request: LocationsListRequest | null) {
  return queryOptions({
    queryKey: [QUERY_FAMILY, "v2", request?.params ?? null] as const,
    queryFn: request === null ? skipToken : ({ signal }) => fetchLocationsListPage(request, signal),
    staleTime: PAGE_STALE_TIME,
  });
}
