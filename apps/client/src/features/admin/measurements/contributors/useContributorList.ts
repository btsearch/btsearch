import type { MeasurementContributor } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { contributorPageQueryOptions } from "../api/contributors";
import { useCursorPages } from "../hooks/useCursorPages";
import type { ContributorListRow } from "./contributorListCells";
import type { ContributorSort } from "./contributorsSearch";
import { useFittedListPagination } from "@/hooks/useFittedListPagination";
import { useIsMobile } from "@/hooks/useMobile";
import { useSettings } from "@/hooks/useSettings";

const CONTRIBUTOR_PAGE_MAX_LIMIT = 200;
const MOBILE_ROW_HEIGHT_FALLBACK = 104;
const NO_CONTRIBUTORS: MeasurementContributor[] = [];

export function useContributorList(sort: ContributorSort) {
  const isMobile = useIsMobile();
  const [chosenTablePageSize, setChosenTablePageSize] = useState<number | null>(null);
  const paging = useFittedListPagination({
    page: 0,
    chosenPageSize: isMobile ? null : chosenTablePageSize,
    maxPageSize: CONTRIBUTOR_PAGE_MAX_LIMIT,
    mobileRowHeightFallback: MOBILE_ROW_HEIGHT_FALLBACK,
    onPagingChange: (next) => {
      if (!isMobile) setChosenTablePageSize(next.pageSize);
    },
  });
  const pageSize = paging.pagination.pageSize;
  const pages = useCursorPages(`${sort}:${pageSize}`);
  const { data: settings } = useSettings();
  const listQuery = useQuery({
    ...contributorPageQueryOptions({ sort, limit: pageSize, cursor: pages.cursor }),
    enabled: paging.isPageSizeMeasured,
  });

  const currentTermsVersion = settings?.measurements?.termsVersion ?? null;
  const contributors = listQuery.data?.data ?? NO_CONTRIBUTORS;
  const rows = contributors.map((contributor): ContributorListRow => ({ contributor, currentTermsVersion }));
  const nextCursor = listQuery.isPlaceholderData ? null : (listQuery.data?.paging.nextCursor ?? null);

  function goNext() {
    if (nextCursor !== null) pages.goNext(nextCursor);
  }

  return {
    paging,
    pages,
    rows,
    total: listQuery.data?.paging.total ?? 0,
    nextCursor,
    goNext,
    isPlaceholderData: listQuery.isPlaceholderData,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    isError: listQuery.isError,
    refetch: listQuery.refetch,
  };
}
