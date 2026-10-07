import { queryOptions } from "@tanstack/react-query";

import { REFERENCE_LIST_STALE_TIME, referenceKeys } from "./queryKeys";
import { fetchTotal } from "./request";

export function regionLocationCountQueryOptions(regionId: number) {
  return queryOptions({
    queryKey: referenceKeys.regionLocationCount(regionId),
    queryFn: ({ signal }) => fetchTotal("locations", { regionIds: String(regionId), includeEmpty: "true" }, signal),
    staleTime: REFERENCE_LIST_STALE_TIME,
  });
}

export function ownerLocationCountQueryOptions(ownerId: number) {
  return queryOptions({
    queryKey: referenceKeys.ownerLocationCount(ownerId),
    queryFn: ({ signal }) => fetchTotal("locations", { structureOwnerIds: String(ownerId), includeEmpty: "true" }, signal),
    staleTime: REFERENCE_LIST_STALE_TIME,
  });
}
