import { Search01Icon } from "@hugeicons/core-free-icons";
import { useTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import type { UserSort } from "../../types";
import { USER_LIST_COLUMNS, USER_LIST_SORTING, UserListSortContext } from "./userListColumns";
import { UserListMobileList } from "./userListMobileList";
import type { UserListRow } from "./useUserListRows";
import { DataTable, type DataTableViewState } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecordListEmptyState } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import type { FittedListPagination } from "@/hooks/useFittedListPagination";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

type UserListTableProps = {
  rows: UserListRow[];
  total: number;
  viewState: DataTableViewState;
  paging: FittedListPagination;
  sort: UserSort;
  activeFilterCount: number;
  isRetrying: boolean;
  onSortChange: (sort: UserSort) => void;
  onClearFilters: () => void;
  onRetry: () => unknown;
  onOpenUser: (userId: string) => void;
};

const COLUMN_COUNT = USER_LIST_COLUMNS.length;
const SKELETON_BAR_WIDTHS = ["w-48", "w-36", "w-18", "w-20"];

function getUserHref(row: UserListRow): string {
  return `/admin/users/${row.user.id}`;
}

function getUserRowId(row: UserListRow): string {
  return row.user.id;
}

function UserListSkeletonBody({ rowCount }: { rowCount: number }) {
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
          {SKELETON_BAR_WIDTHS.map((width) => (
            <td key={width} className="p-2 align-middle">
              <Skeleton className={cn("h-4", width)} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function UserListTable({
  rows,
  total,
  viewState,
  paging,
  sort,
  activeFilterCount,
  isRetrying,
  onSortChange,
  onClearFilters,
  onRetry,
  onOpenUser,
}: UserListTableProps) {
  const { t } = useTranslation("admin");
  const { pagination, autoPageSize, pageSizeOptions } = paging;
  const table = useTable({
    features: appTableFeatures,
    data: rows,
    columns: USER_LIST_COLUMNS,
    getRowId: getUserRowId,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    state: { pagination, sorting: USER_LIST_SORTING[sort] },
    onPaginationChange: paging.setPagination,
  });
  const emptyState: RecordListEmptyState = {
    icon: Search01Icon,
    title: t("users.list.empty.title"),
    description: t("users.list.empty.description"),
    action: activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="cursor-pointer" /> : undefined,
  };

  function openRow(row: UserListRow) {
    onOpenUser(row.user.id);
  }

  if (paging.isMobile) {
    return (
      <div className="flex flex-col">
        <UserListMobileList
          rows={rows}
          viewState={viewState}
          pageSize={pagination.pageSize}
          fillHeight={autoPageSize * paging.mobileRowHeight}
          emptyState={emptyState}
          isRetrying={isRetrying}
          listRef={paging.mobileListRef}
          onRetry={onRetry}
        />
        <DataTable.PaginationFooter>
          <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} showRowsPerPage={false} />
        </DataTable.PaginationFooter>
      </div>
    );
  }

  return (
    <div className="min-w-full">
      <div className="custom-scrollbar overflow-x-auto">
        <UserListSortContext.Provider value={{ sort, onSortChange }}>
          <DataTable.Root table={table} className="block rounded-b-none border-b-0">
            <DataTable.Table>
              <DataTable.Header />
              {viewState === "loading" ? <UserListSkeletonBody rowCount={pagination.pageSize} /> : null}
              {viewState === "error" ? (
                <DataTable.Error columns={COLUMN_COUNT} rows={autoPageSize} onRetry={onRetry} isRetrying={isRetrying} />
              ) : null}
              {viewState === "empty" ? <DataTable.EmptyState columns={COLUMN_COUNT} rows={autoPageSize} {...emptyState} /> : null}
              {viewState === "ready" ? <DataTable.Body onRowClick={openRow} getRowHref={getUserHref} /> : null}
            </DataTable.Table>
          </DataTable.Root>
        </UserListSortContext.Provider>
      </div>
      <DataTable.PaginationFooter>
        <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
      </DataTable.PaginationFooter>
    </div>
  );
}
