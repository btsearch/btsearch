import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { type ListPageState, useAppliedListFilters, useListPageView } from "./listPageQuery";
import { type StationsListFilters, type StationsListVariant, getStationsListFiltersKey } from "./stationsListFilters";
import { buildStationsListRequest, stationsListPageQueryOptions } from "./stationsListRequests";
import { type StationsListRow, toStationsListRows } from "./stationsListRows";
import type { ListReadiness } from "./useListState";
import { useMapLookups } from "@/features/map/data/mapLookups";

export type StationsListPage = ListPageState & {
  rows: StationsListRow[];
  page: number;
  isByRelevance: boolean;
};

type UseStationsListPageArgs = {
  filters: StationsListFilters;
  variant: StationsListVariant;
  pageSize: number | null;
  readiness: ListReadiness;
};

export function useStationsListPage({ filters, variant, pageSize, readiness }: UseStationsListPageArgs): StationsListPage {
  const { lookups } = useMapLookups();
  const appliedFilters = useAppliedListFilters(filters, getStationsListFiltersKey(filters));
  const request = readiness.isReady && pageSize !== null ? buildStationsListRequest({ filters: appliedFilters, variant, pageSize, lookups }) : null;
  const pageQuery = useQuery({ ...stationsListPageQueryOptions(request), placeholderData: keepPreviousData, refetchOnMount: "always" });
  const { data: shownData, ...view } = useListPageView({ pageQuery, hasRequest: request !== null, page: appliedFilters.page, pageSize, readiness });
  const isShownPageFresh = pageQuery.isPlaceholderData || !pageQuery.isStale;
  const rows = useMemo(() => toStationsListRows(shownData, lookups, isShownPageFresh), [shownData, lookups, isShownPageFresh]);

  return { ...view, rows, page: appliedFilters.page, isByRelevance: shownData?.isByRelevance ?? false };
}
