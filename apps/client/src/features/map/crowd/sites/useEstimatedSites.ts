import type { ObservedSiteList } from "@openbts/shared/contract";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ESTIMATED_SITE_STATUSES, type EstimatedSiteStatus, type MapFilters } from "../../data/mapFilters";
import type { MapLookups } from "../../data/mapLookups";
import { listCellRats } from "../../data/mapRequests";
import { useMapQueryHousekeeping } from "../../hooks/useMapQueryHousekeeping";
import type { CrowdAccess } from "../access/useCrowdAccess";
import { ESTIMATED_SITES_FAMILY, estimatedSitesQueryOptions } from "../api/observedQueries";
import type { CrowdTheme } from "../style/palette";
import { type EstimatedSiteMarker, listEstimatedSiteMarkers, mergeEstimatedSites } from "./estimatedSites";

type UseEstimatedSitesArgs = {
  bbox: string;
  isMoving: boolean;
  filters: MapFilters;
  access: CrowdAccess;
  lookups: MapLookups | undefined;
  theme: CrowdTheme;
};

export type EstimatedSitesOverflow = { shown: number; total: number };

const PUBLIC_STATUSES: readonly EstimatedSiteStatus[] = ["unmatched", "suggested"];
const ESTIMATED_SITES_QUERY_FAMILIES = new Set([ESTIMATED_SITES_FAMILY]);
const NO_MARKERS: EstimatedSiteMarker[] = [];

function findOverflow(lists: readonly (ObservedSiteList | undefined)[]): EstimatedSitesOverflow | null {
  for (const list of lists) {
    const total = list?.paging.total;
    if (list !== undefined && total !== undefined && total > list.data.length) return { shown: list.data.length, total };
  }
  return null;
}

export function useEstimatedSites({ bbox, isMoving, filters, access, lookups, theme }: UseEstimatedSitesArgs) {
  const isShown = filters.showEstimatedSites && access.isAvailable;
  const canFetch = isShown && !isMoving && bbox !== "";
  const staffStatuses = ESTIMATED_SITE_STATUSES.filter((status) => filters.estimatedSiteStatuses.includes(status));

  useMapQueryHousekeeping({ bounds: bbox, isMoving, queryFamilies: ESTIMATED_SITES_QUERY_FAMILIES });

  const publicQuery = useQuery({
    ...estimatedSitesQueryOptions(bbox, "public", PUBLIC_STATUSES),
    enabled: canFetch && !access.isAdmin,
    placeholderData: keepPreviousData,
  });
  const mineQuery = useQuery({
    ...estimatedSitesQueryOptions(bbox, "mine", PUBLIC_STATUSES),
    enabled: canFetch && access.isSignedIn && !access.isAdmin,
    placeholderData: keepPreviousData,
  });
  const staffQuery = useQuery({
    ...estimatedSitesQueryOptions(bbox, "staff", staffStatuses),
    enabled: canFetch && access.isStaff && staffStatuses.length > 0,
    placeholderData: keepPreviousData,
  });

  const staffList = access.isStaff ? staffQuery.data : undefined;
  const mineList = access.isSignedIn && !access.isAdmin ? mineQuery.data : undefined;
  const publicList = access.isAdmin ? undefined : publicQuery.data;
  const { operatorIds, rat } = filters;
  const statusFilter = access.isStaff ? filters.estimatedSiteStatuses : null;

  const markers = useMemo(() => {
    if (!isShown) return NO_MARKERS;
    const entries = mergeEstimatedSites([
      ["staff", staffList?.data],
      ["mine", mineList?.data],
      ["public", publicList?.data],
    ]);
    return listEstimatedSiteMarkers(entries, { operatorIds, rats: listCellRats(rat), statuses: statusFilter }, lookups, theme);
  }, [isShown, staffList, mineList, publicList, operatorIds, rat, statusFilter, lookups, theme]);

  const overflow = useMemo(() => (isShown ? findOverflow([staffList, publicList, mineList]) : null), [isShown, staffList, publicList, mineList]);

  return { markers, overflow };
}
