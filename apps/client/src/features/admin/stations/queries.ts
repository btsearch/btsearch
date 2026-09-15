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

export function createConservativeStationImpact(stationId: number): StationUpdateImpact {
  return {
    stationId,
    oldLocationId: null,
    newLocationId: null,
    stationMetadataChanged: true,
    locationMetadataChanged: true,
    locationMoved: true,
    cellsChanged: true,
    cellCountChanged: true,
    sectorsChanged: true,
    extraIdsChanged: true,
  };
}

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
  options: InvalidateStationUpdateQueriesOptions = {},
): void {
  invalidateStationUpdateQueriesBatch(queryClient, [impact], options);
}

type InvalidateStationUpdateQueriesOptions = {
  conservative?: boolean;
  refetchAdminDetail?: boolean;
  invalidateAllStationHistories?: boolean;
};

export function invalidateStationUpdateQueriesBatch(
  queryClient: QueryClient,
  impacts: readonly StationUpdateImpact[],
  { conservative = false, refetchAdminDetail = false, invalidateAllStationHistories = false }: InvalidateStationUpdateQueriesOptions = {},
): void {
  const stationDetailIds = new Set<number>();
  const locationMetadataStationIds = new Set<number>();
  const locationIds = new Set<number>();
  const stationPhotoIds = new Set<number>();
  const locationPhotoIds = new Set<number>();
  let stationMetadataChanged = false;
  let locationMetadataChanged = false;
  let locationMoved = false;
  let cellsChanged = false;
  let cellCountChanged = false;
  let sectorsChanged = false;
  let extraIdsChanged = false;

  for (const impact of impacts) {
    const impactLocationIds = uniqueLocationIds(impact);
    const stationDetailChanged =
      impact.stationMetadataChanged ||
      impact.locationMetadataChanged ||
      impact.locationMoved ||
      impact.cellsChanged ||
      impact.sectorsChanged ||
      impact.extraIdsChanged;
    const stationListingChanged = impact.stationMetadataChanged || impact.locationMetadataChanged || impact.locationMoved || impact.cellsChanged;

    if (stationDetailChanged) stationDetailIds.add(impact.stationId);
    if (impact.locationMetadataChanged) locationMetadataStationIds.add(impact.stationId);
    if (stationListingChanged) for (const locationId of impactLocationIds) locationIds.add(locationId);
    if (conservative || impact.locationMoved) stationPhotoIds.add(impact.stationId);
    if (impact.locationMoved) for (const locationId of impactLocationIds) locationPhotoIds.add(locationId);
    stationMetadataChanged ||= impact.stationMetadataChanged;
    locationMetadataChanged ||= impact.locationMetadataChanged;
    locationMoved ||= impact.locationMoved;
    cellsChanged ||= impact.cellsChanged;
    cellCountChanged ||= impact.cellCountChanged;
    sectorsChanged ||= impact.sectorsChanged;
    extraIdsChanged ||= impact.extraIdsChanged;
  }

  const stationListingChanged = stationMetadataChanged || locationMetadataChanged || locationMoved || cellsChanged;
  const stationSearchChanged = stationListingChanged || extraIdsChanged;
  const locationChanged = locationMetadataChanged || locationMoved;
  const stationDataChanged = stationListingChanged || extraIdsChanged;
  const stationOrLocationChanged = stationMetadataChanged || locationMetadataChanged || locationMoved;
  const stationLocationOrCellsChanged = stationOrLocationChanged || cellsChanged;
  const invalidateEveryStationHistory = invalidateAllStationHistories || locationMetadataChanged;
  const invalidations: Promise<void>[] = [];

  for (const stationId of stationDetailIds)
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: adminStationQueryOptions(stationId).queryKey,
        exact: true,
        refetchType: refetchAdminDetail ? "active" : "none",
      }),
      queryClient.invalidateQueries({ queryKey: ["station", stationId] }),
    );

  if (!invalidateEveryStationHistory)
    for (const stationId of stationDetailIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["station-history", stationId] }));

  if (!locationMetadataChanged)
    for (const stationId of stationDetailIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["station-for-submission", stationId] }));

  if (stationDetailIds.size > 0)
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-operations"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "audit-operations"] }),
    );

  if (invalidateEveryStationHistory) invalidations.push(queryClient.invalidateQueries({ queryKey: ["station-history"] }));

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

  if (stationMetadataChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["duplicate-station-check"] }));

  if (stationMetadataChanged || cellsChanged)
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["stats"], exact: true }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "stats"], exact: true }),
    );

  if (locationChanged || conservative)
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["picker-locations"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-locations-list"] }),
    );

  if (stationListingChanged && !conservative)
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
    );
  }

  for (const stationId of stationPhotoIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] }));

  if (locationMetadataChanged) {
    const locationMetadataStationIdStrings = new Set([...locationMetadataStationIds].map(String));
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: ["admin", "station"],
        predicate: (query) => !locationMetadataStationIdStrings.has(String(query.queryKey[2])),
      }),
      queryClient.invalidateQueries({
        queryKey: ["station"],
        predicate: (query) => {
          const queryStationId = query.queryKey[1];
          return (
            (typeof queryStationId !== "number" || !locationMetadataStationIds.has(queryStationId)) &&
            (query.queryKey.length === 2 || query.queryKey[2] === "internal")
          );
        },
      }),
      queryClient.invalidateQueries({ queryKey: ["station-for-submission"] }),
    );
  }

  if (!conservative)
    for (const locationId of locationPhotoIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["location-photos", locationId] }));

  if (stationOrLocationChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["photos-gallery"] }));

  if (stationLocationOrCellsChanged) queryClient.removeQueries({ queryKey: ["nsg", "station-correlation"] });

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

  if (stationMetadataChanged || cellsChanged) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["stats", "summary"] }),
      queryClient.invalidateQueries({ queryKey: ["stats", "permits"] }),
    );
  }

  if (stationLocationOrCellsChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["stats", "voivodeships"] }));

  if (cellsChanged || sectorsChanged || extraIdsChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["stats", "completeness"] }));

  if (cellCountChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "delta"] }));

  void Promise.all(invalidations);
}
