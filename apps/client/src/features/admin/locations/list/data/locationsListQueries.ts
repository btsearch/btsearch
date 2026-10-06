import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { type LocationsListFilters, getLocationsListFiltersKey } from "./locationsListFilters";
import { buildLocationsListRequest, locationsListPageQueryOptions } from "./locationsListRequests";
import { type LocationsListRow, toLocationsListRows } from "./locationsListRows";
import { useMapLookups } from "@/features/map/data/mapLookups";
import { type ListPageState, useAppliedListFilters, useListPageView } from "@/features/stations/list/data/listPageQuery";
import type { ListReadiness } from "@/features/stations/list/data/useListState";

export type LocationsListPage = ListPageState & {
  rows: LocationsListRow[];
  page: number;
};

type UseLocationsListPageArgs = {
  filters: LocationsListFilters;
  pageSize: number | null;
  readiness: ListReadiness;
};

export function useLocationsListPage({ filters, pageSize, readiness }: UseLocationsListPageArgs): LocationsListPage {
  const { lookups } = useMapLookups();
  const appliedFilters = useAppliedListFilters(filters, getLocationsListFiltersKey(filters));
  const request = readiness.isReady && pageSize !== null ? buildLocationsListRequest({ filters: appliedFilters, pageSize }) : null;
  const pageQuery = useQuery({ ...locationsListPageQueryOptions(request), placeholderData: keepPreviousData, refetchOnMount: "always" });
  const { data: shownData, ...view } = useListPageView({ pageQuery, hasRequest: request !== null, page: appliedFilters.page, pageSize, readiness });
  const rows = useMemo(() => toLocationsListRows(shownData, lookups), [shownData, lookups]);

  return { ...view, rows, page: appliedFilters.page };
}
