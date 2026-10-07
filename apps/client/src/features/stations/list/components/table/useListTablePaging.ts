import { useEffect, useRef } from "react";

import { LIST_BOX_BORDER_WIDTH, LIST_HEAD_HEIGHT, LIST_PAGER_HEIGHT, LIST_ROW_HEIGHT, LIST_SORT_BAR_HEIGHT } from "./listTableRow";
import { rescaleListPage } from "@/features/stations/list/data/listPaging";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";

type PagedFilters = {
  page: number;
  pageSize: number | null;
};

type PagedFiltersChange<Filters> = (change: (current: Filters) => Filters) => void;

export type ListTablePaging = {
  containerRef: (node: HTMLDivElement | null) => void;
  isMobile: boolean;
  pageSize: number | null;
  fittedPageSize: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizePick: (pageSize: number) => void;
};

const SMALLEST_FITTED_PAGE_SIZE = 1;

function listPageSizeOptions(fittedOptions: number[], pageSize: number | null): number[] {
  if (pageSize === null || fittedOptions.includes(pageSize)) return fittedOptions;
  return [...fittedOptions, pageSize].sort((left, right) => left - right);
}

export function isListPageFilled(paging: ListTablePaging, rowCount: number): boolean {
  return paging.pageSize === paging.fittedPageSize && rowCount >= paging.fittedPageSize;
}

export function useListTablePaging<Filters extends PagedFilters>(
  filters: Filters,
  onFiltersChange: PagedFiltersChange<Filters>,
  cardHeight: number,
): ListTablePaging {
  const isMobile = useIsMobile();
  const fit = useTablePagination({
    rowHeight: isMobile ? cardHeight : LIST_ROW_HEIGHT,
    headerHeight: LIST_BOX_BORDER_WIDTH + (isMobile ? LIST_SORT_BAR_HEIGHT : LIST_HEAD_HEIGHT),
    paginationHeight: LIST_PAGER_HEIGHT,
    minRows: SMALLEST_FITTED_PAGE_SIZE,
  });
  const { autoPageSize: fittedPageSize, isPageSizeMeasured } = fit;
  const { page, pageSize: pickedPageSize } = filters;
  const pageSize = pickedPageSize ?? (isPageSizeMeasured ? fittedPageSize : null);
  const lastFittedPageSize = useRef<number | null>(null);

  useEffect(() => {
    if (!isPageSizeMeasured) return;

    const previousPageSize = lastFittedPageSize.current;
    lastFittedPageSize.current = fittedPageSize;
    if (previousPageSize === null || previousPageSize === fittedPageSize || pickedPageSize !== null) return;
    if (rescaleListPage(page, previousPageSize, fittedPageSize) === page) return;

    onFiltersChange((current) => ({ ...current, page: rescaleListPage(current.page, previousPageSize, fittedPageSize) }));
  }, [fittedPageSize, isPageSizeMeasured, pickedPageSize, page, onFiltersChange]);

  function changePage(nextPage: number) {
    onFiltersChange((current) => ({ ...current, page: nextPage }));
  }

  function pickPageSize(pickedSize: number) {
    if (pageSize === null) return;

    onFiltersChange((current) => ({
      ...current,
      pageSize: pickedSize === fittedPageSize ? null : pickedSize,
      page: rescaleListPage(current.page, pageSize, pickedSize),
    }));
  }

  return {
    containerRef: fit.containerRef,
    isMobile,
    pageSize,
    fittedPageSize,
    pageSizeOptions: listPageSizeOptions(fit.pageSizeOptions, pageSize),
    onPageChange: changePage,
    onPageSizePick: pickPageSize,
  };
}

export function useLastListPage<Filters extends PagedFilters>(pageBeyondEnd: number | null, onFiltersChange: PagedFiltersChange<Filters>): void {
  useEffect(() => {
    if (pageBeyondEnd !== null) onFiltersChange((current) => ({ ...current, page: pageBeyondEnd }));
  }, [pageBeyondEnd, onFiltersChange]);
}
