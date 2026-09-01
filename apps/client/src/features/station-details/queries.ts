import { queryOptions } from "@tanstack/react-query";

import type { StationSource } from "@/types/station";

import { fetchStation } from "./api";

export function stationQueryOptions(stationId: number, source: StationSource = "internal") {
  return queryOptions({
    queryKey: ["station", stationId, source] as const,
    queryFn: () => fetchStation(stationId),
    enabled: source === "internal",
    staleTime: 1000 * 60 * 5,
  });
}
