import { useEffect, useRef } from "react";

import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT } from "@/components/ui/data-table";
import { useMeasuredListRowHeight } from "@/hooks/useMeasuredListRowHeight";
import { useIsMobile } from "@/hooks/useMobile";
import { type PaginationState, useTablePagination } from "@/hooks/useTablePageSize";

type FittedListPaging = {
  page: number;
  pageSize: number | null;
};

type FittedListPaginationOptions = {
  page: number;
  chosenPageSize: number | null;
  maxPageSize: number;
  mobileRowHeightFallback?: number;
  mobilePageSize?: number;
  onPagingChange: (paging: FittedListPaging) => void;
};

const TABLE_FIT = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
  minRows: 1,
};
const MOBILE_ROW_MEASUREMENT = { round: false, safetyBuffer: 0 };
const MOBILE_PAGINATION_HEIGHT = 51;

export type FittedListPagination = ReturnType<typeof useFittedListPagination>;

export function useFittedListPagination({
  page,
  chosenPageSize,
  maxPageSize,
  mobileRowHeightFallback = DATA_TABLE_ROW_HEIGHT,
  mobilePageSize,
  onPagingChange,
}: FittedListPaginationOptions) {
  const isMobile = useIsMobile();
  const { listRef: mobileListRef, rowHeight: mobileRowHeight } = useMeasuredListRowHeight(mobileRowHeightFallback, MOBILE_ROW_MEASUREMENT);
  const tableFit = useTablePagination(TABLE_FIT);
  const mobileFit = useTablePagination({ rowHeight: mobileRowHeight, headerHeight: 0, paginationHeight: MOBILE_PAGINATION_HEIGHT, minRows: 1 });
  const fixedPageSize = isMobile ? (mobilePageSize ?? null) : null;
  const fit = isMobile && fixedPageSize === null ? mobileFit : tableFit;
  const fittedPageSize = fixedPageSize ?? fit.autoPageSize;
  const pagination: PaginationState = { pageIndex: page, pageSize: fixedPageSize ?? chosenPageSize ?? fittedPageSize };
  const pageSizeOptions =
    fixedPageSize === null
      ? [...new Set([...fit.pageSizeOptions, pagination.pageSize])].filter((pageSize) => pageSize <= maxPageSize).sort((left, right) => left - right)
      : [fixedPageSize];
  const isPageSizeMeasured = fixedPageSize !== null || fit.isPageSizeMeasured;
  const usesFittedPageSize = fixedPageSize === null && chosenPageSize === null;
  const latestRef = useRef({ page, chosenPageSize, usesFittedPageSize, onPagingChange });
  const lastFittedPageSizeRef = useRef<number | null>(null);

  useEffect(() => {
    latestRef.current = { page, chosenPageSize, usesFittedPageSize, onPagingChange };
  });

  useEffect(() => {
    if (!isPageSizeMeasured) return;

    const lastFittedPageSize = lastFittedPageSizeRef.current;
    lastFittedPageSizeRef.current = fittedPageSize;
    if (lastFittedPageSize === null || lastFittedPageSize === fittedPageSize) return;

    const latest = latestRef.current;
    if (!latest.usesFittedPageSize) return;

    const firstRowPage = Math.floor((latest.page * lastFittedPageSize) / fittedPageSize);
    if (firstRowPage !== latest.page) latest.onPagingChange({ page: firstRowPage, pageSize: latest.chosenPageSize });
  }, [fittedPageSize, isPageSizeMeasured]);

  function setPagination(updater: PaginationState | ((current: PaginationState) => PaginationState)) {
    const next = typeof updater === "function" ? updater(pagination) : updater;
    const isPageSizeChanged = next.pageSize !== pagination.pageSize;
    if (!isPageSizeChanged && next.pageIndex === pagination.pageIndex) return;

    const fittedOrChosenPageSize = next.pageSize === fittedPageSize ? null : next.pageSize;
    onPagingChange({ page: next.pageIndex, pageSize: isPageSizeChanged ? fittedOrChosenPageSize : chosenPageSize });
  }

  return {
    isMobile,
    containerRef: fit.containerRef,
    mobileListRef,
    mobileRowHeight,
    pagination,
    setPagination,
    autoPageSize: fittedPageSize,
    pageSizeOptions,
    isPageSizeMeasured,
  };
}
