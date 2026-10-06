import { queryOptions } from "@tanstack/react-query";

import type { BreakdownDimension, CountryStatistics, StationBreakdownRow } from "../types";
import { REFERENCE_LIST_STALE_TIME, referenceKeys } from "./queryKeys";
import { fetchV2Data } from "@/lib/api";

export function countryStatisticsQueryOptions() {
  return queryOptions({
    queryKey: referenceKeys.countryStatistics(),
    queryFn: ({ signal }) => fetchV2Data<CountryStatistics[]>("statistics", { signal }),
    staleTime: REFERENCE_LIST_STALE_TIME,
  });
}

export function stationBreakdownQueryOptions(dimension: BreakdownDimension) {
  return queryOptions({
    queryKey: referenceKeys.stationBreakdown(dimension),
    queryFn: ({ signal }) => fetchV2Data<StationBreakdownRow[]>(`statistics/stations?groupBy=${dimension}`, { signal }),
    staleTime: REFERENCE_LIST_STALE_TIME,
  });
}
