import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";

import { parseFilters } from "@/features/map/filters";
import { bandsQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/queries";
import { API_BASE, fetchApiData, fetchJson } from "@/lib/api";
import type { Station, StationFilters, StationSortBy, StationSortDirection, StationStatus } from "@/types/station";

import { DEFAULT_STATIONS_LIST_STATUSES, getStationStatusFilterCount, isDefaultStationsListStatusSelection, isStationStatus } from "../stationStatus";

const FETCH_LIMIT = 120;

type SearchWithFiltersParams = {
  query: string;
  filters: StationFilters;
  regionNames: string[];
};

function buildSearchQuery({ query, filters, regionNames }: SearchWithFiltersParams): string {
  const parsed = parseFilters(query);
  const existingKeys = new Set(parsed.filters.map((f) => f.key));

  const filterParts: string[] = [query];

  if (filters.operators.length && !existingKeys.has("mnc")) filterParts.push(`mnc:${filters.operators.join(",")}`);
  if (filters.bands.length && !existingKeys.has("band")) filterParts.push(`band:${filters.bands.join(",")}`);
  if (filters.rat.length && !existingKeys.has("rat")) {
    const rats = filters.rat.filter((r) => r !== "iot");
    if (rats.length) filterParts.push(`rat:${rats.join(",")}`);
    if (filters.rat.includes("iot") && !existingKeys.has("supports_iot")) filterParts.push("supports_iot:true");
  }
  if (filters.status.length && !existingKeys.has("status")) filterParts.push(`status:${filters.status.join(",")}`);
  if (regionNames.length && !existingKeys.has("region")) filterParts.push(`region:${regionNames.join(",")}`);

  return filterParts.join(" ").trim();
}

const searchStations = async (query: string, sort: StationSortDirection, sortBy: StationSortBy | undefined) => {
  const params = new URLSearchParams();
  if (sortBy) {
    params.set("sort", sort);
    params.set("sortBy", sortBy);
  }
  return fetchApiData<Station[]>(`search?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
};

type FetchStationsParams = {
  pageParam?: number;
  limit: number;
  filters: StationFilters;
  regionNames: string[];
  sort: StationSortDirection;
  sortBy: StationSortBy | undefined;
};

type StationsResponse = { data: Station[]; totalCount: number };

const fetchStationsList = async (params: FetchStationsParams): Promise<StationsResponse> => {
  const page = params.pageParam ?? 1;
  const searchParams = new URLSearchParams();
  searchParams.set("page", page.toString());
  searchParams.set("limit", params.limit.toString());

  if (params.filters.operators.length) searchParams.set("operators", params.filters.operators.join(","));
  if (params.filters.bands.length) searchParams.set("bands", params.filters.bands.join(","));
  if (params.filters.rat.length) searchParams.set("rat", params.filters.rat.join(","));
  searchParams.set("status", params.filters.status.join(","));
  if (params.regionNames.length) searchParams.set("regions", params.regionNames.join(","));
  searchParams.set("sort", params.sort);
  searchParams.set("sortBy", params.sortBy ?? "updatedAt");

  return fetchJson<StationsResponse>(`${API_BASE}/stations?${searchParams.toString()}`);
};

const parseArrayParam = (value: string | null): string[] => {
  if (!value) return [];
  return value.split(",").filter(Boolean);
};

const parseNumberArrayParam = (value: string | null): number[] => {
  if (!value) return [];
  return value
    .split(",")
    .map(Number)
    .filter((n) => !Number.isNaN(n));
};

const parseStatusArrayParam = (value: string | null): StationStatus[] => {
  const statuses = parseArrayParam(value).filter(isStationStatus);
  return statuses.length > 0 ? [...new Set(statuses)] : [...DEFAULT_STATIONS_LIST_STATUSES];
};

type FullState = {
  operators: number[];
  bands: number[];
  rat: string[];
  status: StationStatus[];
  recentDays: number | null;
  regions: number[];
  q: string;
  order: StationSortDirection;
  sort: StationSortBy | undefined;
};

function stateToParams(state: FullState): URLSearchParams {
  const next = new URLSearchParams();
  if (state.operators.length) next.set("mnc", state.operators.join(","));
  if (state.bands.length) next.set("band", state.bands.join(","));
  if (state.rat.length) next.set("rat", state.rat.join(","));
  if (!isDefaultStationsListStatusSelection(state.status)) next.set("status", state.status.join(","));
  if (state.recentDays !== null) next.set("recent", String(state.recentDays));
  if (state.regions.length) next.set("regions", state.regions.join(","));
  if (state.q) next.set("q", state.q);
  if (state.order !== "desc") next.set("order", state.order);
  if (state.sort && (state.sort !== "updatedAt" || state.q.trim().length > 0)) next.set("sort", state.sort);
  return next;
}

function paramsToState(searchParams: URLSearchParams): FullState {
  return {
    operators: parseNumberArrayParam(searchParams.get("mnc")),
    bands: parseNumberArrayParam(searchParams.get("band")),
    rat: parseArrayParam(searchParams.get("rat")),
    status: parseStatusArrayParam(searchParams.get("status")),
    recentDays: (() => {
      const v = searchParams.get("recent");
      if (!v) return null;
      if (v === "1" || v === "true") return 30;
      const n = Number(v);
      return n >= 1 && n <= 30 ? n : null;
    })(),
    regions: parseNumberArrayParam(searchParams.get("regions")),
    q: searchParams.get("q") ?? "",
    order: (searchParams.get("order") as StationSortDirection) ?? "desc",
    sort: searchParams.get("sort") as StationSortBy | undefined,
  };
}

export function useStationsData() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.searchStr), [location.searchStr]);

  const state = useMemo(() => paramsToState(searchParams), [searchParams]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const commit = useCallback(
    (patch: Partial<FullState>) => {
      const merged = { ...stateRef.current, ...patch };
      stateRef.current = merged;
      void navigate({ to: ".", search: Object.fromEntries(stateToParams(merged).entries()) as Record<string, string>, replace: true });
    },
    [navigate],
  );

  const filters = useMemo<StationFilters>(
    () => ({
      operators: state.operators,
      bands: state.bands,
      rat: state.rat,
      status: state.status,
      source: "internal",
      recentDays: state.recentDays,
      showStations: true,
      showRadiolines: false,
      showHeatmap: false,
      recentDateFields: ["createdAt"],
      radiolineOperators: [],
      showPlannedMeasurements: false,
    }),
    [state.operators, state.bands, state.rat, state.status, state.recentDays],
  );

  const selectedRegions = state.regions;
  const searchQuery = state.q;
  const sort = state.order;
  const sortBy = state.sort;
  const isSearchMode = searchQuery.trim().length > 0;

  const setFilters = useCallback(
    (newFilters: StationFilters | ((prev: StationFilters) => StationFilters)) => {
      const current: StationFilters = {
        operators: stateRef.current.operators,
        bands: stateRef.current.bands,
        rat: stateRef.current.rat,
        status: stateRef.current.status,
        source: "internal",
        recentDays: stateRef.current.recentDays,
        showStations: true,
        showRadiolines: false,
        showHeatmap: false,
        recentDateFields: ["createdAt"],
        radiolineOperators: [],
        showPlannedMeasurements: false,
      };
      const resolved = typeof newFilters === "function" ? newFilters(current) : newFilters;
      commit({
        operators: resolved.operators,
        bands: resolved.bands,
        rat: resolved.rat,
        status: resolved.status,
        recentDays: resolved.recentDays,
      });
    },
    [commit],
  );

  const setSelectedRegions = useCallback(
    (value: number[] | ((prev: number[]) => number[])) => {
      const resolved = typeof value === "function" ? value(stateRef.current.regions) : value;
      commit({ regions: resolved });
    },
    [commit],
  );

  const setSearchQuery = useCallback(
    (value: string | ((prev: string) => string)) => {
      const resolved = typeof value === "function" ? value(stateRef.current.q) : value;
      const enteringSearch = stateRef.current.q.trim().length === 0 && resolved.trim().length > 0;
      commit(enteringSearch ? { q: resolved, sort: undefined } : { q: resolved });
    },
    [commit],
  );

  const setSort = useCallback(
    (value: StationSortDirection | ((prev: StationSortDirection) => StationSortDirection)) => {
      const resolved = typeof value === "function" ? value(stateRef.current.order) : value;
      commit({ order: resolved });
    },
    [commit],
  );

  const setSortBy = useCallback(
    (value: StationSortBy | undefined | ((prev: StationSortBy | undefined) => StationSortBy | undefined)) => {
      const resolved = typeof value === "function" ? value(stateRef.current.sort) : value;
      commit({ sort: resolved });
    },
    [commit],
  );

  const { data: operators = [] } = useQuery(operatorsQueryOptions());

  const { data: bands = [] } = useQuery(bandsQueryOptions());

  const { data: regions = [] } = useQuery(regionsQueryOptions());

  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  const selectedRegionNames = useMemo(() => {
    return selectedRegions.map((id) => regionById.get(id)?.code).filter((code): code is string => Boolean(code));
  }, [selectedRegions, regionById]);

  const { data, fetchNextPage, hasNextPage, isLoading, isFetching } = useInfiniteQuery({
    queryKey: ["stations-list", FETCH_LIMIT, filters.operators, filters.bands, filters.rat, filters.status, selectedRegionNames, sort, sortBy],
    queryFn: ({ pageParam }) =>
      fetchStationsList({
        pageParam,
        limit: FETCH_LIMIT,
        filters,
        regionNames: selectedRegionNames,
        sort,
        sortBy,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.data.length === FETCH_LIMIT ? allPages.length + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnMount: "always",
    enabled: !isSearchMode,
  });

  const combinedSearchQuery = useMemo(() => {
    if (!isSearchMode) return "";
    return buildSearchQuery({
      query: searchQuery,
      filters,
      regionNames: selectedRegionNames,
    });
  }, [isSearchMode, searchQuery, filters, selectedRegionNames]);

  const searchQuerySortBy = searchParams.has("sort") ? sortBy : undefined;
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ["station-search-table", combinedSearchQuery, sort, searchQuerySortBy],
    queryFn: () => searchStations(combinedSearchQuery, sort, searchQuerySortBy),
    enabled: combinedSearchQuery.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const stations = useMemo(() => {
    return isSearchMode ? searchResults : (data?.pages.flatMap((page) => page.data) ?? []);
  }, [data, isSearchMode, searchResults]);

  const totalStationsFromApi = useMemo(() => {
    if (!data?.pages.length) return undefined;
    return data.pages[data.pages.length - 1]?.totalCount;
  }, [data]);

  const uniqueBandValues = useMemo(() => {
    return [...new Set(bands.map((b) => b.value))].sort((a, b) => a - b);
  }, [bands]);

  const activeFilterCount =
    filters.operators.length + filters.bands.length + filters.rat.length + selectedRegions.length + getStationStatusFilterCount(filters.status);

  return {
    stations,
    operators,
    regions,
    uniqueBandValues,
    totalStations: isSearchMode ? undefined : totalStationsFromApi,

    filters,
    setFilters,
    selectedRegions,
    setSelectedRegions,
    activeFilterCount,

    sort,
    setSort,
    sortBy: isSearchMode ? sortBy : (sortBy ?? "updatedAt"),
    setSortBy,

    searchQuery,
    setSearchQuery,

    isLoading: isSearchMode ? isSearching : isLoading,
    isFetching,
    hasMore: isSearchMode ? false : hasNextPage,
    loadMore: hasNextPage && !isSearchMode ? fetchNextPage : undefined,
  };
}
