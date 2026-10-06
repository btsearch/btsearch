import { queryOptions, skipToken } from "@tanstack/react-query";

import type { StationSearchHit } from "@/features/map/searchApi";
import { fetchV2Data } from "@/lib/api";
import { normalizeSearchText } from "@/lib/apiValues";

const TARGET_SEARCH_INCLUDE = "operator,location.region,cells.band";
export const TARGET_SEARCH_MIN_LENGTH = 2;
const TARGET_SEARCH_STALE_TIME = 1000 * 30;

function fetchTargetStations(text: string, signal?: AbortSignal): Promise<StationSearchHit[]> {
  const params = new URLSearchParams({ q: text, include: TARGET_SEARCH_INCLUDE });
  return fetchV2Data<StationSearchHit[]>(`search?${params.toString()}`, { signal });
}

export function targetStationSearchQueryOptions(query: string) {
  const text = normalizeSearchText(query);

  return queryOptions({
    queryKey: ["station-search", text, "internal", "v2", "submission-target"] as const,
    queryFn: text.length < TARGET_SEARCH_MIN_LENGTH ? skipToken : ({ signal }) => fetchTargetStations(text, signal),
    staleTime: TARGET_SEARCH_STALE_TIME,
  });
}
