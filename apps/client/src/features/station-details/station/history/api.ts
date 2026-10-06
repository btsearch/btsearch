import { infiniteQueryOptions } from "@tanstack/react-query";

import type { StationHistoryList } from "./types";
import { API_V2_BASE, fetchJson } from "@/lib/api";

const STATION_HISTORY_PAGE_SIZE = 25;
const STATION_HISTORY_STALE_TIME = 30_000;

function fetchStationHistoryPage(stationId: number, cursor: string | null, signal?: AbortSignal): Promise<StationHistoryList> {
  const params = new URLSearchParams({ limit: String(STATION_HISTORY_PAGE_SIZE) });
  if (cursor !== null) params.set("cursor", cursor);
  return fetchJson<StationHistoryList>(`${API_V2_BASE}/stations/${stationId}/history?${params.toString()}`, { signal });
}

export function stationHistoryQueryOptions(stationId: number) {
  return infiniteQueryOptions({
    queryKey: ["station-history", stationId, "v2"] as const,
    queryFn: ({ pageParam, signal }) => fetchStationHistoryPage(stationId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.paging.nextCursor,
    staleTime: STATION_HISTORY_STALE_TIME,
  });
}
