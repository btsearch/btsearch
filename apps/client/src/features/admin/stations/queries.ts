import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";

import { auditOperationKeys } from "@/features/admin/audit-operations/queries";
import { fetchUkePermitsByStationId, hasMapLocationsSource } from "@/features/map/api";
import { editingKeys } from "@/features/station-editing/data/keys";

export type StationUpdateImpact = {
  stationId: number | null;
  oldLocationId: number | null;
  newLocationId: number | null;
  stationMetadataChanged: boolean;
  locationMetadataChanged: boolean;
  locationMoved: boolean;
  cellsChanged: boolean;
  cellCountChanged: boolean;
  sectorsChanged: boolean;
  extraIdsChanged: boolean;
  uplinkChanged: boolean;
};

type InvalidateStationUpdateQueriesOptions = {
  conservative?: boolean;
  refetchAdminDetail?: boolean;
  invalidateAllStationHistories?: boolean;
};

const REGISTER_PERMITS_STALE_TIME = 1000 * 60 * 5;

export function createConservativeStationImpact(stationId: number | null): StationUpdateImpact {
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
    uplinkChanged: true,
  };
}

export function registerStationPermitsQueryOptions(registerStationId: string | undefined) {
  return queryOptions({
    queryKey: ["uke-permits-preload", registerStationId] as const,
    queryFn: registerStationId === undefined ? skipToken : () => fetchUkePermitsByStationId(registerStationId),
    staleTime: REGISTER_PERMITS_STALE_TIME,
  });
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

export function invalidateStationUpdateQueriesBatch(
  queryClient: QueryClient,
  impacts: readonly StationUpdateImpact[],
  { conservative = false, invalidateAllStationHistories = false }: InvalidateStationUpdateQueriesOptions = {},
): void {
  const stationDetailIds = new Set<number>();
  const locationMetadataStationIds = new Set<number>();
  const locationIds = new Set<number>();
  const changedStationLocationIds = new Set<number>();
  const stationPhotoIds = new Set<number>();
  const locationPhotoIds = new Set<number>();
  let stationMetadataChanged = false;
  let locationMetadataChanged = false;
  let locationMoved = false;
  let cellsChanged = false;
  let sectorsChanged = false;
  let extraIdsChanged = false;
  let uplinkChanged = false;
  let hasChangedStationWithoutLocationId = false;

  for (const impact of impacts) {
    const impactLocationIds = uniqueLocationIds(impact);
    const stationDetailChanged =
      impact.stationMetadataChanged ||
      impact.locationMetadataChanged ||
      impact.locationMoved ||
      impact.cellsChanged ||
      impact.sectorsChanged ||
      impact.extraIdsChanged ||
      impact.uplinkChanged;
    const stationListingChanged =
      impact.stationMetadataChanged || impact.locationMetadataChanged || impact.locationMoved || impact.cellsChanged || impact.uplinkChanged;

    if (impact.stationId !== null) {
      if (stationDetailChanged) stationDetailIds.add(impact.stationId);
      if (impact.locationMetadataChanged) locationMetadataStationIds.add(impact.stationId);
      if (conservative || impact.locationMoved) stationPhotoIds.add(impact.stationId);
    }
    if (stationListingChanged) for (const locationId of impactLocationIds) locationIds.add(locationId);
    if (stationDetailChanged) {
      for (const locationId of impactLocationIds) changedStationLocationIds.add(locationId);
      hasChangedStationWithoutLocationId ||= impactLocationIds.length === 0;
    }
    if (impact.locationMoved) for (const locationId of impactLocationIds) locationPhotoIds.add(locationId);
    stationMetadataChanged ||= impact.stationMetadataChanged;
    locationMetadataChanged ||= impact.locationMetadataChanged;
    locationMoved ||= impact.locationMoved;
    cellsChanged ||= impact.cellsChanged;
    sectorsChanged ||= impact.sectorsChanged;
    extraIdsChanged ||= impact.extraIdsChanged;
    uplinkChanged ||= impact.uplinkChanged;
  }

  const stationListingChanged = stationMetadataChanged || locationMetadataChanged || locationMoved || cellsChanged || uplinkChanged;
  const locationChanged = locationMetadataChanged || locationMoved;
  const stationDataChanged = stationListingChanged || extraIdsChanged;
  const stationOrLocationChanged = stationMetadataChanged || locationMetadataChanged || locationMoved;
  const stationLocationOrCellsChanged = stationOrLocationChanged || cellsChanged;
  const invalidateEveryStationHistory = invalidateAllStationHistories || locationMetadataChanged;
  const invalidations: Promise<void>[] = [];

  for (const stationId of stationDetailIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["station", stationId] }));

  if (!invalidateEveryStationHistory) {
    for (const stationId of stationDetailIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["station-history", stationId] }));
  }

  if (stationDataChanged || sectorsChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: auditOperationKeys.all() }));

  if (invalidateEveryStationHistory) invalidations.push(queryClient.invalidateQueries({ queryKey: ["station-history"] }));

  if (stationListingChanged) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["stations-list"] }),
      queryClient.invalidateQueries({ queryKey: ["station-search-table"] }),
      queryClient.invalidateQueries({
        queryKey: ["locations"],
        predicate: (query) => hasMapLocationsSource(query.queryKey, "internal"),
      }),
      queryClient.invalidateQueries({
        queryKey: ["list-locations"],
        predicate: (query) => hasMapLocationsSource(query.queryKey, "internal"),
      }),
    );
  }

  if (stationDataChanged) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: ["station-search"],
        predicate: (query) => query.queryKey[2] === "internal",
      }),
    );
  }

  if (stationMetadataChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: editingKeys.duplicateSiteIdRoot }));

  if (stationMetadataChanged || cellsChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["stats"], exact: true }));

  if (stationListingChanged || conservative) invalidations.push(queryClient.invalidateQueries({ queryKey: ["admin-locations-list"] }));

  if (locationChanged || conservative) invalidations.push(queryClient.invalidateQueries({ queryKey: editingKeys.pickerLocationsRoot }));

  if (stationListingChanged && !conservative) {
    for (const locationId of locationIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["admin", "location", String(locationId)] }));
  }

  if (conservative) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["location"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "location"] }),
      queryClient.invalidateQueries({ queryKey: ["location-photos"] }),
    );
  } else {
    for (const locationId of changedStationLocationIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["location", locationId] }));
    if (hasChangedStationWithoutLocationId) invalidations.push(queryClient.invalidateQueries({ queryKey: ["location"] }));
  }

  for (const stationId of stationPhotoIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] }));

  if (locationMetadataChanged) {
    invalidations.push(
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
    );
  }

  if (!conservative) {
    for (const locationId of locationPhotoIds) invalidations.push(queryClient.invalidateQueries({ queryKey: ["location-photos", locationId] }));
  }

  if (stationOrLocationChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["photos-gallery"] }));

  if (stationLocationOrCellsChanged) queryClient.removeQueries({ queryKey: ["nsg", "station-correlation"] });

  if (stationDataChanged) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: editingKeys.adminSubmissionsRoot }),
      queryClient.invalidateQueries({ queryKey: editingKeys.mySubmissionsRoot }),
      queryClient.invalidateQueries({ queryKey: editingKeys.submissionRoot }),
      queryClient.invalidateQueries({ queryKey: editingKeys.dashboardPendingSubmissions }),
      queryClient.invalidateQueries({ queryKey: editingKeys.pendingSubmissionsCount }),
    );
  }

  if (stationMetadataChanged || cellsChanged) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["stats", "summary"] }),
      queryClient.invalidateQueries({ queryKey: ["stats", "permits"] }),
    );
  }

  if (stationLocationOrCellsChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["stats", "voivodeships"] }));

  if (cellsChanged || sectorsChanged || extraIdsChanged) invalidations.push(queryClient.invalidateQueries({ queryKey: ["stats", "completeness"] }));

  void Promise.all(invalidations);
}
