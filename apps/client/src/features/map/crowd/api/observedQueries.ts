import type { ObservedCellList, ObservedCellRecord, ObservedSite, ObservedSiteList } from "@openbts/shared/contract";
import { MAX_LOCATION_LIST_LIMIT } from "@openbts/shared/contract/constants";
import { queryOptions, skipToken } from "@tanstack/react-query";

import type { EstimatedSiteStatus } from "../../data/mapFilters";
import { API_V2_BASE, fetchJson, fetchV2Data } from "@/lib/api";

export type EstimatedSiteSource = "public" | "mine" | "staff";

export type ObservedCellsScope = { kind: "sites"; observedSiteIds: readonly number[] } | { kind: "station"; stationId: number };

export const ESTIMATED_SITES_FAMILY = "estimated-sites";
export const OBSERVED_SITE_FAMILY = "observed-site";
export const OBSERVED_CELLS_FAMILY = "observed-cells";

const SITE_LIST_PATHS: Record<EstimatedSiteSource, string> = {
  public: "observed/sites",
  mine: "observed/sites/mine",
  staff: "observed/sites/staff",
};
const ESTIMATED_SITES_STALE_TIME = 1000 * 60 * 2;
const ESTIMATED_SITES_GC_TIME = 1000 * 60;
const OBSERVED_CELLS_STALE_TIME = 1000 * 60 * 5;
const OBSERVED_CELLS_LIMIT = 200;
const OBSERVED_CELLS_INCLUDE = "footprint,edges";

function fetchEstimatedSites(
  bbox: string,
  source: EstimatedSiteSource,
  statuses: readonly EstimatedSiteStatus[],
  signal: AbortSignal,
): Promise<ObservedSiteList> {
  const params = new URLSearchParams({ bbox, statuses: statuses.join(","), includeTotal: "true", limit: String(MAX_LOCATION_LIST_LIMIT) });
  return fetchJson<ObservedSiteList>(`${API_V2_BASE}/${SITE_LIST_PATHS[source]}?${params.toString()}`, {
    signal,
    credentials: source === "public" ? "omit" : "include",
  });
}

export function estimatedSitesQueryOptions(bbox: string, source: EstimatedSiteSource, statuses: readonly EstimatedSiteStatus[]) {
  return queryOptions({
    queryKey: [ESTIMATED_SITES_FAMILY, bbox, source, statuses] as const,
    queryFn: bbox === "" ? skipToken : ({ signal }) => fetchEstimatedSites(bbox, source, statuses, signal),
    staleTime: ESTIMATED_SITES_STALE_TIME,
    gcTime: ESTIMATED_SITES_GC_TIME,
  });
}

export function observedSiteQueryOptions(observedSiteId: number | null) {
  return queryOptions({
    queryKey: [OBSERVED_SITE_FAMILY, observedSiteId, "v2"] as const,
    queryFn: observedSiteId === null ? skipToken : ({ signal }) => fetchV2Data<ObservedSite>(`observed/sites/${observedSiteId}`, { signal }),
    staleTime: ESTIMATED_SITES_STALE_TIME,
  });
}

function readCellsScopeParam(scope: ObservedCellsScope): [string, string] {
  if (scope.kind === "station") return ["matchedStationIds", String(scope.stationId)];
  return ["observedSiteIds", [...scope.observedSiteIds].sort((left, right) => left - right).join(",")];
}

async function fetchObservedCells(scope: ObservedCellsScope, signal: AbortSignal): Promise<ObservedCellRecord[]> {
  const [name, value] = readCellsScopeParam(scope);
  const params = new URLSearchParams({ [name]: value, include: OBSERVED_CELLS_INCLUDE, limit: String(OBSERVED_CELLS_LIMIT) });
  const list = await fetchJson<ObservedCellList>(`${API_V2_BASE}/observed/cells?${params.toString()}`, { signal });
  return list.data;
}

export function observedCellsQueryOptions(scope: ObservedCellsScope | null) {
  const param = scope === null ? null : readCellsScopeParam(scope);
  return queryOptions({
    queryKey: [OBSERVED_CELLS_FAMILY, param?.[0] ?? null, param?.[1] ?? null, "v2"] as const,
    queryFn: scope === null ? skipToken : ({ signal }) => fetchObservedCells(scope, signal),
    staleTime: OBSERVED_CELLS_STALE_TIME,
  });
}
