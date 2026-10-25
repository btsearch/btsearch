import { UserSearch01Icon } from "@hugeicons/core-free-icons";
import { useTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { CursorPagination } from "../components/cursorPagination";
import type { ContributorListRow } from "./contributorListCells";
import { CONTRIBUTOR_LIST_COLUMNS, CONTRIBUTOR_LIST_SORTING, ContributorSortContext } from "./contributorListColumns";
import { ContributorListMobileList } from "./contributorListMobileList";
import type { ContributorSort } from "./contributorsSearch";
import { DataTable, type DataTableViewState } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecordListEmptyState } from "@/features/admin/reference/components/shared/recordListPrimitives";
import type { FittedListPagination } from "@/hooks/useFittedListPagination";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

type ContributorListTableProps = {
  rows: ContributorListRow[];
  total: number;
  viewState: DataTableViewState;
  paging: FittedListPagination;
  pageIndex: number;
  hasNextPage: boolean;
  sort: ContributorSort;
  isRetrying: boolean;
  onSortChange: (sort: ContributorSort) => void;
  onFirstPage: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onRetry: () => unknown;
  onOpenContributor: (userId: string) => void;
};

const COLUMN_COUNT = CONTRIBUTOR_LIST_COLUMNS.length;
const SKELETON_BAR_WIDTHS = ["w-12", "w-10", "w-10", "w-10", "w-8", "w-24", "w-20"];

function getContributorHref(row: ContributorListRow): string {
  return `/admin/measurements/contributors/${row.contributor.user.id}`;
}

function getContributorRowId(row: ContributorListRow): string {
  return row.contributor.user.id;
}

function ContributorListSkeletonBody({ rowCount }: { rowCount: number }) {
  return (
    <tbody aria-hidden="true" className="[&_tr:last-child]:border-0">
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <tr key={rowIndex} className="h-16 border-b">
          <td className="p-2 align-middle">
            <div className="flex items-center gap-3 pl-2">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
          </td>
          {SKELETON_BAR_WIDTHS.map((width, index) => (
            <td key={index} className="p-2 align-middle">
              <Skeleton className={cn("h-4", width)} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function ContributorListTable({
  rows,
  total,
  viewState,
  paging,
  pageIndex,
  hasNextPage,
  sort,
  isRetrying,
  onSortChange,
  onFirstPage,
  onPreviousPage,
  onNextPage,
  onRetry,
  onOpenContributor,
}: ContributorListTableProps) {
  const { t } = useTranslation("admin");
  const { pagination, autoPageSize, pageSizeOptions } = paging;
  const table = useTable({
    features: appTableFeatures,
    data: rows,
    columns: CONTRIBUTOR_LIST_COLUMNS,
    getRowId: getContributorRowId,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    state: { pagination, sorting: CONTRIBUTOR_LIST_SORTING[sort] },
    onPaginationChange: paging.setPagination,
  });
  const emptyState: RecordListEmptyState = {
    icon: UserSearch01Icon,
    title: t("measurements.contributors.empty.title"),
    description: t("measurements.contributors.empty.description"),
  };
  const pager = (
    <DataTable.PaginationFooter>
      <CursorPagination
        pageIndex={pageIndex}
        pageSize={pagination.pageSize}
        rowCount={rows.length}
        total={total}
        hasNextPage={hasNextPage}
        pageSizeOptions={paging.isMobile ? undefined : pageSizeOptions}
        onPageSizeChange={paging.isMobile ? undefined : (pageSize) => paging.setPagination({ pageIndex: 0, pageSize })}
        onFirstPage={onFirstPage}
        onPreviousPage={onPreviousPage}
        onNextPage={onNextPage}
      />
    </DataTable.PaginationFooter>
  );

  function openRow(row: ContributorListRow) {
    onOpenContributor(row.contributor.user.id);
  }

  if (paging.isMobile) {
    return (
      <div className="flex flex-col">
        <ContributorListMobileList
          rows={rows}
          viewState={viewState}
          pageSize={pagination.pageSize}
          fillHeight={autoPageSize * paging.mobileRowHeight}
          emptyState={emptyState}
          isRetrying={isRetrying}
          listRef={paging.mobileListRef}
          onRetry={onRetry}
        />
        {pager}
      </div>
    );
  }

  return (
    <div className="min-w-full">
      <div className="custom-scrollbar overflow-x-auto">
        <ContributorSortContext.Provider value={{ sort, onSortChange }}>
          <DataTable.Root table={table} className="block rounded-b-none border-b-0">
            <DataTable.Table>
              <DataTable.Header />
              {viewState === "loading" ? <ContributorListSkeletonBody rowCount={pagination.pageSize} /> : null}
              {viewState === "error" ? (
                <DataTable.Error columns={COLUMN_COUNT} rows={autoPageSize} onRetry={onRetry} isRetrying={isRetrying} />
              ) : null}
              {viewState === "empty" ? <DataTable.EmptyState columns={COLUMN_COUNT} rows={autoPageSize} {...emptyState} /> : null}
              {viewState === "ready" ? <DataTable.Body onRowClick={openRow} getRowHref={getContributorHref} /> : null}
            </DataTable.Table>
          </DataTable.Root>
        </ContributorSortContext.Provider>
      </div>
      {pager}
    </div>
  );
}
