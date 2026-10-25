import type { ObservationFlagKind, ObservationFlagSort, ObservationFlagStatus } from "@openbts/shared/contract";
import type { QueryClient } from "@tanstack/react-query";

export type FlagListParams = {
  status: ObservationFlagStatus;
  kinds: readonly ObservationFlagKind[];
  countryCodes: readonly string[];
  regionIds: readonly number[];
  operatorIds: readonly number[];
  station: string;
  stationIds: readonly number[];
  sort: ObservationFlagSort;
};

const OBSERVATION_FLAGS_ROOT = ["admin", "observation-flags"] as const;

export const observationFlagKeys = {
  lists: () => [...OBSERVATION_FLAGS_ROOT, "list"] as const,
  list: (params: FlagListParams) => [...OBSERVATION_FLAGS_ROOT, "list", "page", params] as const,
  stationFlags: (stationId: number, kind: ObservationFlagKind) => [...OBSERVATION_FLAGS_ROOT, "list", "station", stationId, kind] as const,
  stationCounts: (stationId: number) => [...OBSERVATION_FLAGS_ROOT, "list", "station-counts", stationId] as const,
  dashboard: () => [...OBSERVATION_FLAGS_ROOT, "list", "dashboard"] as const,
  flag: (flagId: number) => [...OBSERVATION_FLAGS_ROOT, "flag", flagId] as const,
  siteGroup: (observedSiteIds: readonly number[]) => [...OBSERVATION_FLAGS_ROOT, "site-group", observedSiteIds] as const,
  evidences: () => [...OBSERVATION_FLAGS_ROOT, "evidence"] as const,
  evidence: (observedSiteId: number) => [...OBSERVATION_FLAGS_ROOT, "evidence", observedSiteId] as const,
  nearestStations: (latitude: number, longitude: number, operatorIds: readonly number[]) =>
    [...OBSERVATION_FLAGS_ROOT, "nearest-stations", latitude, longitude, operatorIds] as const,
};

export async function invalidateFlagQueries(queryClient: QueryClient, flagIds: readonly number[] = []): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: observationFlagKeys.lists() }),
    ...flagIds.map((flagId) => queryClient.invalidateQueries({ queryKey: observationFlagKeys.flag(flagId) })),
  ]);
}
