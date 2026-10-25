import type { ObservedSite, ObservedSiteEvidence, ObservedSiteList, ObservedSiteUpdate, StationCreate, StationList } from "@openbts/shared/contract";
import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";

import { invalidateFlagQueries, observationFlagKeys } from "./keys";
import { ESTIMATED_SITES_FAMILY, OBSERVED_CELLS_FAMILY, OBSERVED_SITE_FAMILY } from "@/features/map/crowd/api/observedQueries";
import { STATION_INCLUDE } from "@/features/station-details/station/api";
import type { StationRecord } from "@/features/station-details/station/types";
import { API_V2_BASE, JSON_HEADERS, appendList, fetchJson, fetchV2Data } from "@/lib/api";

type NearPoint = { latitude: number; longitude: number };

const NEAREST_STATION_LIMIT = 1;
const MIN_GROUP_SIZE = 2;
const NEAREST_STATION_INCLUDE = "operator,location.region,cells.band";
const EVIDENCE_STALE_TIME = 1000 * 60;
const OBSERVED_SITE_FAMILIES = [OBSERVED_SITE_FAMILY, ESTIMATED_SITES_FAMILY, OBSERVED_CELLS_FAMILY];

export function siteEvidenceQueryOptions(observedSiteId: number | null) {
  return queryOptions({
    queryKey: observationFlagKeys.evidence(observedSiteId ?? 0),
    queryFn:
      observedSiteId === null
        ? skipToken
        : ({ signal }) => fetchV2Data<ObservedSiteEvidence>(`observed/sites/${observedSiteId}/evidence`, { signal }),
    staleTime: EVIDENCE_STALE_TIME,
  });
}

export function siteGroupQueryOptions(observedSiteIds: readonly number[]) {
  const ids = [...new Set(observedSiteIds)].sort((left, right) => left - right);
  return queryOptions({
    queryKey: observationFlagKeys.siteGroup(ids),
    queryFn:
      ids.length < MIN_GROUP_SIZE
        ? skipToken
        : async ({ signal }) => {
            const query = new URLSearchParams({ ids: ids.join(","), limit: String(ids.length) });
            const page = await fetchJson<ObservedSiteList>(`${API_V2_BASE}/observed/sites/staff?${query.toString()}`, { signal });
            return page.data;
          },
    staleTime: EVIDENCE_STALE_TIME,
  });
}

export function nearestStationsQueryOptions(point: NearPoint | null, operatorIds: readonly number[]) {
  return queryOptions({
    queryKey: observationFlagKeys.nearestStations(point?.latitude ?? 0, point?.longitude ?? 0, operatorIds),
    queryFn:
      point === null
        ? skipToken
        : async ({ signal }) => {
            const query = new URLSearchParams({
              latitude: String(point.latitude),
              longitude: String(point.longitude),
              sort: "distance",
              include: NEAREST_STATION_INCLUDE,
              limit: String(NEAREST_STATION_LIMIT),
            });
            appendList(query, "operatorIds", operatorIds);
            const page = await fetchJson<StationList>(`${API_V2_BASE}/stations?${query.toString()}`, { signal });
            return page.data;
          },
  });
}

export function updateObservedSite(observedSiteId: number, change: ObservedSiteUpdate): Promise<ObservedSite> {
  return fetchV2Data<ObservedSite>(`observed/sites/${observedSiteId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(change),
  });
}

export function createStationFromSite(observedSiteId: number, body: StationCreate, idempotencyKey: string): Promise<StationRecord> {
  return fetchV2Data<StationRecord>(`observed/sites/${observedSiteId}/station?include=${STATION_INCLUDE}`, {
    method: "POST",
    headers: { ...JSON_HEADERS, "X-Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

export async function invalidateSiteQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    invalidateFlagQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: observationFlagKeys.evidences() }),
    ...OBSERVED_SITE_FAMILIES.map((family) => queryClient.invalidateQueries({ queryKey: [family] })),
  ]);
}
