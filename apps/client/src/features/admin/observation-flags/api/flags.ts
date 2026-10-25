import type {
  ObservationFlag,
  ObservationFlagKind,
  ObservationFlagList,
  ObservationFlagStatus,
  ObservationFlagUpdate,
} from "@openbts/shared/contract";
import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";

import { type FlagListParams, observationFlagKeys } from "./keys";
import { API_V2_BASE, JSON_HEADERS, appendList, fetchJson, fetchV2Data } from "@/lib/api";

const FLAG_INCLUDE = "station.location,cell,observedCell,observedSite";
const FLAG_PAGE_SIZE = 25;
const DASHBOARD_FLAG_LIMIT = 5;
const STATION_FLAG_LIMIT = 50;
const OPEN_STATUS: ObservationFlagStatus = "open";

function fetchFlagList(query: URLSearchParams, signal: AbortSignal): Promise<ObservationFlagList> {
  return fetchJson<ObservationFlagList>(`${API_V2_BASE}/observed/flags?${query.toString()}`, { signal });
}

function toFlagListQuery(params: FlagListParams, cursor: string | null): URLSearchParams {
  const query = new URLSearchParams({ statuses: params.status, sort: params.sort, include: FLAG_INCLUDE, limit: String(FLAG_PAGE_SIZE) });
  appendList(query, "kinds", params.kinds);
  appendList(query, "countryCodes", params.countryCodes);
  appendList(query, "regionIds", params.regionIds);
  appendList(query, "operatorIds", params.operatorIds);
  appendList(query, "stationIds", params.stationIds);
  if (params.station !== "") query.set("station", params.station);
  if (cursor === null) query.set("includeCounts", "true");
  else query.set("cursor", cursor);
  return query;
}

export function flagListQueryOptions(params: FlagListParams) {
  return infiniteQueryOptions({
    queryKey: observationFlagKeys.list(params),
    queryFn: ({ pageParam, signal }) => fetchFlagList(toFlagListQuery(params, pageParam), signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.paging.nextCursor,
    staleTime: 0,
  });
}

export function flagQueryOptions(flagId: number | null) {
  return queryOptions({
    queryKey: observationFlagKeys.flag(flagId ?? 0),
    queryFn:
      flagId === null ? skipToken : ({ signal }) => fetchV2Data<ObservationFlag>(`observed/flags/${flagId}?include=${FLAG_INCLUDE}`, { signal }),
    staleTime: 0,
  });
}

export function stationFlagsQueryOptions(stationId: number | null, kind: ObservationFlagKind) {
  return queryOptions({
    queryKey: observationFlagKeys.stationFlags(stationId ?? 0, kind),
    queryFn:
      stationId === null
        ? skipToken
        : async ({ signal }) => {
            const query = new URLSearchParams({
              stationIds: String(stationId),
              kinds: kind,
              statuses: OPEN_STATUS,
              include: "cell",
              limit: String(STATION_FLAG_LIMIT),
            });
            const page = await fetchFlagList(query, signal);
            return page.data;
          },
    staleTime: 0,
  });
}

export function stationFlagCountsQueryOptions(stationId: number | null) {
  return queryOptions({
    queryKey: observationFlagKeys.stationCounts(stationId ?? 0),
    queryFn:
      stationId === null
        ? skipToken
        : async ({ signal }) => {
            const query = new URLSearchParams({ stationIds: String(stationId), statuses: OPEN_STATUS, includeCounts: "true", limit: "1" });
            const page = await fetchFlagList(query, signal);
            return page.counts ?? null;
          },
  });
}

export function dashboardFlagsQueryOptions() {
  return queryOptions({
    queryKey: observationFlagKeys.dashboard(),
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({
        statuses: OPEN_STATUS,
        sort: "-createdAt",
        include: FLAG_INCLUDE,
        limit: String(DASHBOARD_FLAG_LIMIT),
        includeTotal: "true",
      });
      return fetchFlagList(query, signal);
    },
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export function updateFlag(flagId: number, change: ObservationFlagUpdate): Promise<ObservationFlag> {
  return fetchV2Data<ObservationFlag>(`observed/flags/${flagId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(change),
  });
}
