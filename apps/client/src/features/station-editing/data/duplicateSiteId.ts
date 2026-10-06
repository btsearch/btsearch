import type { Paging, SearchResult } from "@openbts/shared/contract";
import { queryOptions, skipToken } from "@tanstack/react-query";

import { editingKeys } from "./keys";
import { EVERY_STATION_STATUS } from "@/features/station-details/station/utils/stations";
import { API_V2_BASE, fetchJson } from "@/lib/api";

export type DuplicateStation = {
  stationId: number;
  siteId: string;
};

type SiteIdSearchPage = {
  data: Pick<SearchResult, "id" | "siteId" | "operatorId">[];
  paging: Paging;
};

const SHORTEST_CHECKED_SITE_ID = 2;
const SEARCH_LIMIT = 200;
const DUPLICATE_CHECK_STALE_TIME = 30_000;
const DOUBLE_QUOTES = /"/g;

function toSearchedSiteId(siteId: string): string {
  return siteId.trim().replace(DOUBLE_QUOTES, "");
}

async function fetchDuplicateStation(siteId: string, operatorId: number, signal?: AbortSignal): Promise<DuplicateStation | null> {
  const params = new URLSearchParams({
    q: `bts_id:"${siteId}"`,
    operatorIds: String(operatorId),
    statuses: EVERY_STATION_STATUS,
    limit: String(SEARCH_LIMIT),
  });
  const page = await fetchJson<SiteIdSearchPage>(`${API_V2_BASE}/search?${params.toString()}`, { signal });
  const wanted = siteId.toLowerCase();
  const match = page.data.find((station) => station.operatorId === operatorId && station.siteId.trim().toLowerCase() === wanted);

  return match === undefined ? null : { stationId: match.id, siteId: match.siteId };
}

export function duplicateSiteIdQueryOptions(siteId: string, operatorId: number | null) {
  const searched = toSearchedSiteId(siteId);

  return queryOptions({
    queryKey: editingKeys.duplicateSiteId(searched, operatorId),
    queryFn:
      operatorId !== null && searched.length >= SHORTEST_CHECKED_SITE_ID
        ? ({ signal }) => fetchDuplicateStation(searched, operatorId, signal)
        : skipToken,
    staleTime: DUPLICATE_CHECK_STALE_TIME,
  });
}
