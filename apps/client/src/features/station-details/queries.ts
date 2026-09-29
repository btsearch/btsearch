import { queryOptions, skipToken } from "@tanstack/react-query";

import { fetchStation, fetchStationPermits, fetchUkeStation } from "./api";
import type { StationSource } from "@/types/station";

export function stationQueryOptions(stationId: number, source: StationSource = "internal") {
  return queryOptions({
    queryKey: ["station", stationId, source] as const,
    queryFn: () => fetchStation(stationId),
    enabled: source === "internal",
    staleTime: 1000 * 60 * 5,
  });
}

export function ukeStationQueryOptions(ukeStationId: number) {
  return queryOptions({
    queryKey: ["uke-station", ukeStationId] as const,
    queryFn: () => fetchUkeStation(ukeStationId),
    staleTime: 1000 * 60 * 5,
  });
}

export function stationPermitsQueryOptions(stationId: number | undefined) {
  return queryOptions({
    queryKey: ["station-permits", stationId] as const,
    queryFn: stationId === undefined ? skipToken : () => fetchStationPermits(stationId),
    staleTime: 1000 * 60 * 10,
  });
}
