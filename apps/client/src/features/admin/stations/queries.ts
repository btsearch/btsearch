import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { fetchApiData } from "@/lib/api";
import type { Station } from "@/types/station";

export type StationUpdateImpact = {
  stationId: number;
  oldLocationId: number | null;
  newLocationId: number | null;
  stationMetadataChanged: boolean;
  locationMetadataChanged: boolean;
  locationMoved: boolean;
  cellsChanged: boolean;
  cellCountChanged: boolean;
  sectorsChanged: boolean;
  extraIdsChanged: boolean;
};

export function adminStationQueryOptions(stationId: number | string) {
  const id = String(stationId);
  return queryOptions({
    queryKey: ["admin", "station", id] as const,
    queryFn: () => fetchApiData<Station>(`stations/${id}`),
  });
}

function hasInternalSource(value: unknown): boolean {
  return typeof value === "object" && value !== null && "source" in value && value.source === "internal";
}

function uniqueLocationIds(impact: StationUpdateImpact): number[] {
  return [...new Set([impact.oldLocationId, impact.newLocationId].filter((id): id is number => id !== null))];
}

export function invalidateStationUpdateQueries(
  queryClient: QueryClient,
  impact: StationUpdateImpact,
  { conservative = false, refetchAdminDetail = false }: { conservative?: boolean; refetchAdminDetail?: boolean } = {},
): void {
  const stationId = impact.stationId;
  const locationIds = uniqueLocationIds(impact);
  const stationDetailChanged =
    impact.stationMetadataChanged ||
    impact.locationMetadataChanged ||
    impact.locationMoved ||
    impact.cellsChanged ||
    impact.sectorsChanged ||
    impact.extraIdsChanged;
  const stationListingChanged = impact.stationMetadataChanged || impact.locationMetadataChanged || impact.locationMoved || impact.cellsChanged;
  const stationSearchChanged = stationListingChanged || impact.extraIdsChanged;
  const locationChanged = impact.locationMetadataChanged || impact.locationMoved;
  const invalidations: Promise<void>[] = [];

  if (stationDetailChanged)
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: adminStationQueryOptions(stationId).queryKey,
        exact: true,
        refetchType: refetchAdminDetail ? "active" : "none",
      }),
      queryClient.invalidateQueries({ queryKey: ["station", stationId] }),
      queryClient.invalidateQueries({ queryKey: ["station-history", stationId] }),
      queryClient.invalidateQueries({ queryKey: ["station-for-submission", stationId] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "audit-logs"] }),
    );

  if (stationListingChanged)
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["stations-list"] }),
      queryClient.invalidateQueries({ queryKey: ["station-search-table"] }),
      queryClient.invalidateQueries({
        queryKey: ["locations"],
        predicate: (query) => hasInternalSource(query.queryKey[2]),
      }),
      queryClient.invalidateQueries({
        queryKey: ["list-locations"],
        predicate: (query) => query.queryKey[2] === "internal",
      }),
    );

  if (stationSearchChanged)
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["stations-search"] }),
      queryClient.invalidateQueries({
        queryKey: ["station-search"],
        predicate: (query) => query.queryKey[2] === "internal",
      }),
    );

  if (impact.stationMetadataChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["duplicate-station-check"] }));

  if (impact.stationMetadataChanged || impact.cellsChanged)
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["stats"], exact: true }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "stats"], exact: true }),
    );

  if (locationChanged)
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["picker-locations"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-locations-list"] }),
    );

  if (stationListingChanged)
    for (const locationId of locationIds)
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["location", locationId] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "location", String(locationId)] }),
      );

  if (conservative) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["location"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "location"] }),
      queryClient.invalidateQueries({ queryKey: ["location-photos"] }),
      queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] }),
    );
    if (!locationChanged)
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["picker-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-locations-list"] }),
      );
  }

  if (impact.locationMetadataChanged) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: ["admin", "station"],
        predicate: (query) => query.queryKey[2] !== String(stationId),
      }),
      queryClient.invalidateQueries({
        queryKey: ["station"],
        predicate: (query) => query.queryKey[1] !== stationId && (query.queryKey.length === 2 || query.queryKey[2] === "internal"),
      }),
      queryClient.invalidateQueries({
        queryKey: ["station-history"],
        predicate: (query) => query.queryKey[1] !== stationId,
      }),
      queryClient.invalidateQueries({
        queryKey: ["station-for-submission"],
        predicate: (query) => query.queryKey[1] !== stationId,
      }),
    );
  }

  if (impact.locationMoved) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] }));
    for (const locationId of locationIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["location-photos", locationId] }));
  }

  if (impact.stationMetadataChanged || impact.locationMetadataChanged || impact.locationMoved)
    invalidations.push(queryClient.invalidateQueries({ queryKey: ["photos-gallery"] }));

  const stationDataChanged =
    impact.stationMetadataChanged || impact.locationMetadataChanged || impact.locationMoved || impact.cellsChanged || impact.extraIdsChanged;

  if (impact.stationMetadataChanged || impact.locationMetadataChanged || impact.locationMoved || impact.cellsChanged)
    queryClient.removeQueries({ queryKey: ["nsg", "station-correlation"] });

  if (stationDataChanged)
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["admin", "submission"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "submissions"] }),
      queryClient.invalidateQueries({ queryKey: ["my-submission", "detail"] }),
      queryClient.invalidateQueries({ queryKey: ["my-submissions"] }),
      queryClient.invalidateQueries({ queryKey: ["submission-edit"] }),
      queryClient.invalidateQueries({ queryKey: ["submissionBatches", "details"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "pending-submissions"] }),
    );

  if (impact.stationMetadataChanged || impact.cellsChanged) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["stats", "summary"] }),
      queryClient.invalidateQueries({ queryKey: ["stats", "permits"] }),
    );
  }

  if (impact.stationMetadataChanged || impact.locationMetadataChanged || impact.locationMoved || impact.cellsChanged)
    invalidations.push(queryClient.invalidateQueries({ queryKey: ["stats", "voivodeships"] }));

  if (impact.cellsChanged || impact.sectorsChanged || impact.extraIdsChanged)
    invalidations.push(queryClient.invalidateQueries({ queryKey: ["stats", "completeness"] }));

  if (impact.cellCountChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "delta"] }));

  void Promise.all(invalidations);
}
