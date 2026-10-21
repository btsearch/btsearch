import type { ReferenceListPaging } from "./referenceListSearch";
import { DATA_TABLE_HEADER_HEIGHT, type DataTableViewState } from "@/components/ui/data-table";
import type { ListTablePagerProps } from "@/features/stations/list/components/table/listTablePager";
import { LIST_BOX_BORDER_WIDTH } from "@/features/stations/list/components/table/listTableRow";
import { isListPageFilled, useFittedListTablePaging } from "@/features/stations/list/components/table/useListTablePaging";
import { getListOffset, getListPageCount } from "@/features/stations/list/data/listPaging";
import { useMeasuredListRowHeight } from "@/hooks/useMeasuredListRowHeight";
import { useIsMobile } from "@/hooks/useMobile";

type ReferenceListPageOptions<Row, Criteria extends ReferenceListPaging> = {
  rows: Row[];
  viewState: DataTableViewState;
  criteria: Criteria;
  rowHeight: number;
  onCriteriaChange: (changes: Partial<Criteria>) => void;
};

const MOBILE_ROW_MEASUREMENT = { round: false, safetyBuffer: 0 };

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
