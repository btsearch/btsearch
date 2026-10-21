import { DATA_TABLE_HEADER_HEIGHT, type DataTableViewState } from "@/components/ui/data-table";
import type { ListTablePagerProps } from "@/features/stations/list/components/table/listTablePager";
import { LIST_BOX_BORDER_WIDTH } from "@/features/stations/list/components/table/listTableRow";
import { isListPageFilled, useFittedListTablePaging } from "@/features/stations/list/components/table/useListTablePaging";
import {
  FIRST_LIST_PAGE,
  LAST_LIST_PAGE,
  LIST_PAGE_SIZE_LIMIT,
  SMALLEST_LIST_PAGE_SIZE,
  getListOffset,
  getListPageCount,
} from "@/features/stations/list/data/listPaging";
import { parseUrlNumber } from "@/features/stations/list/data/listUrlValues";
import { useMeasuredListRowHeight } from "@/hooks/useMeasuredListRowHeight";
import { useIsMobile } from "@/hooks/useMobile";

export type ReferenceListPagingSearch = {
  page?: number;
  size?: number;
};

export type ReferenceListPaging = {
  page: number;
  pageSize: number | null;
};

type ReferenceListPageOptions<Row, Criteria extends ReferenceListPaging> = {
  rows: Row[];
  viewState: DataTableViewState;
  criteria: Criteria;
  rowHeight: number;
  onCriteriaChange: (changes: Partial<Criteria>) => void;
};

const MOBILE_ROW_MEASUREMENT = { round: false, safetyBuffer: 0 };

export function parseReferenceListPagingSearch(search: Record<string, unknown>): ReferenceListPagingSearch {
  return {
    page: parseUrlNumber(search.page, FIRST_LIST_PAGE, LAST_LIST_PAGE),
    size: parseUrlNumber(search.size, SMALLEST_LIST_PAGE_SIZE, LIST_PAGE_SIZE_LIMIT),
  };
}

export function readReferenceListPaging(search: ReferenceListPagingSearch): ReferenceListPaging {
  return { page: search.page ?? FIRST_LIST_PAGE, pageSize: search.size ?? null };
}

export function toReferenceListPagingSearch({ page, pageSize }: ReferenceListPaging): ReferenceListPagingSearch {
  return { page: page > FIRST_LIST_PAGE ? page : undefined, size: pageSize ?? undefined };
}

function listPageRows<Row>(rows: Row[], page: number, pageSize: number | null): Row[] {
  if (pageSize === null) return [];

  const offset = getListOffset(page, pageSize);
  return rows.slice(offset, offset + pageSize);
}

export function useReferenceListPage<Row, Criteria extends ReferenceListPaging>({
  rows,
  viewState,
  criteria,
  rowHeight,
  onCriteriaChange,
}: ReferenceListPageOptions<Row, Criteria>) {
  const isMobile = useIsMobile();
  const { listRef: mobileListRef, rowHeight: mobileRowHeight } = useMeasuredListRowHeight(rowHeight, MOBILE_ROW_MEASUREMENT);
  const fit = isMobile
    ? { rowHeight: mobileRowHeight, headerHeight: LIST_BOX_BORDER_WIDTH, keepsFirstRowOnResize: false }
    : { rowHeight, headerHeight: LIST_BOX_BORDER_WIDTH + DATA_TABLE_HEADER_HEIGHT, keepsFirstRowOnResize: true };
  const paging = useFittedListTablePaging(criteria, (change) => onCriteriaChange(change(criteria)), fit);
  const { pageSize } = paging;
  const pageCount = getListPageCount(rows.length, pageSize ?? 1);
  const page = Math.min(criteria.page, pageCount);
  const pageRows = listPageRows(rows, page, pageSize);
  const isPaged = viewState === "ready" || viewState === "loading";
  const pager: ListTablePagerProps | undefined = isPaged ? { paging, page, pageCount, total: viewState === "ready" ? rows.length : null } : undefined;

  return {
    pageRows,
    pager,
    mobileListRef,
    skeletonRowCount: paging.fittedPageSize,
    isFilled: !isMobile && isListPageFilled(paging, pageRows.length),
  };
}
