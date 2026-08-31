import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";

import { operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { LocationSortBy, LocationSortDirection } from "@/types/station";

import { fetchLocationsList } from "../api";

const FETCH_LIMIT = 100;
const STORAGE_KEY = "admin:locations:filters";

export type LocationFilters = {
  operators: number[];
};

type StoredState = {
  operators: number[];
  regions: number[];
  sort: LocationSortDirection;
  sortBy: LocationSortBy;
};

function loadFromStorage(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { operators: [], regions: [], sort: "desc", sortBy: "updatedAt" };
    const parsed = JSON.parse(raw);
    return {
      operators: Array.isArray(parsed.operators) ? parsed.operators : [],
      regions: Array.isArray(parsed.regions) ? parsed.regions : [],
      sort: parsed.sort === "asc" || parsed.sort === "desc" ? parsed.sort : "desc",
      sortBy: parsed.sortBy ?? "updatedAt",
    };
  } catch {
    return { operators: [], regions: [], sort: "desc", sortBy: "updatedAt" };
  }
}

function persist(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function useLocationsData() {
  const stored = useMemo(() => loadFromStorage(), []);

  const [filters, setFiltersRaw] = useState<LocationFilters>({ operators: stored.operators });
  const [selectedRegions, setSelectedRegionsRaw] = useState<number[]>(stored.regions);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSortRaw] = useState<LocationSortDirection>(stored.sort);
  const [sortBy, setSortByRaw] = useState<LocationSortBy>(stored.sortBy);

  const stateRef = useRef<StoredState>({ operators: stored.operators, regions: stored.regions, sort: stored.sort, sortBy: stored.sortBy });

  const save = useCallback((patch: Partial<StoredState>) => {
    Object.assign(stateRef.current, patch);
    persist(stateRef.current);
  }, []);

  const setFilters = useCallback(
    (newFilters: LocationFilters | ((prev: LocationFilters) => LocationFilters)) => {
      setFiltersRaw((prev) => {
        const resolved = typeof newFilters === "function" ? newFilters(prev) : newFilters;
        save({ operators: resolved.operators });
        return resolved;
      });
    },
    [save],
  );

  const setSelectedRegions = useCallback(
    (value: number[] | ((prev: number[]) => number[])) => {
      setSelectedRegionsRaw((prev) => {
        const resolved = typeof value === "function" ? value(prev) : value;
        save({ regions: resolved });
        return resolved;
      });
    },
    [save],
  );

  const clearAllFilters = useCallback(() => {
    setFiltersRaw({ operators: [] });
    setSelectedRegionsRaw([]);
    setSearchQuery("");
    save({ operators: [], regions: [] });
  }, [save]);

  const setSort = useCallback(
    (value: LocationSortDirection | ((prev: LocationSortDirection) => LocationSortDirection)) => {
      setSortRaw((prev) => {
        const resolved = typeof value === "function" ? value(prev) : value;
        save({ sort: resolved });
        return resolved;
      });
    },
    [save],
  );

  const setSortBy = useCallback(
    (value: LocationSortBy | undefined | ((prev: LocationSortBy | undefined) => LocationSortBy | undefined)) => {
      setSortByRaw((prev) => {
        const resolved = (typeof value === "function" ? value(prev) : value) ?? "updatedAt";
        save({ sortBy: resolved });
        return resolved;
      });
    },
    [save],
  );

  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { data: regions = [] } = useQuery(regionsQueryOptions());

  const selectedRegionCodes = useMemo(() => {
    return selectedRegions.map((id) => regions.find((r) => r.id === id)?.code).filter((code): code is string => Boolean(code));
  }, [selectedRegions, regions]);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const { data, fetchNextPage, hasNextPage, isLoading, isFetching, isFetchingNextPage, isError, refetch } = useInfiniteQuery({
    queryKey: ["admin-locations-list", FETCH_LIMIT, filters.operators, selectedRegionCodes, sort, sortBy, debouncedSearch],
    queryFn: ({ pageParam }) =>
      fetchLocationsList({
        page: pageParam,
        limit: FETCH_LIMIT,
        regions: selectedRegionCodes.length ? selectedRegionCodes.join(",") : undefined,
        operators: filters.operators.length ? filters.operators.join(",") : undefined,
        sort,
        sortBy,
        orphaned: true,
        q: debouncedSearch || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.data.length === FETCH_LIMIT ? allPages.length + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnMount: "always",
  });

  const locations = useMemo(() => {
    return data?.pages.flatMap((page) => page.data) ?? [];
  }, [data]);

  const totalLocations = useMemo(() => {
    if (!data?.pages.length) return undefined;
    return data.pages[data.pages.length - 1]?.totalCount;
  }, [data]);

  const activeFilterCount = filters.operators.length + selectedRegions.length + Number(searchQuery.trim().length > 0);
  const hasActiveFilters = activeFilterCount > 0;

  return {
    locations,
    operators,
    regions,
    totalLocations,
    filters,
    setFilters,
    selectedRegions,
    setSelectedRegions,
    clearAllFilters,
    activeFilterCount,
    hasActiveFilters,
    searchQuery,
    setSearchQuery,
    sort,
    sortBy,
    setSort,
    setSortBy,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isError,
    refetch,
    hasMore: hasNextPage,
    loadMore: hasNextPage ? fetchNextPage : undefined,
  };
}
