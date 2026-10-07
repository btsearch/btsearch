import { Search01Icon, TaskDaily01Icon } from "@hugeicons/core-free-icons";
import type { List } from "@openbts/shared/contract";
import { useTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { ADMIN_LISTS_COLUMNS } from "./adminListsColumns";
import { AdminListsMobileList } from "./adminListsMobileList";
import { DataTable, type DataTableViewState } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecordListEmptyState } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import type { FittedListPagination } from "@/hooks/useFittedListPagination";
import { appTableFeatures } from "@/lib/tableFeatures";

type AdminListsTableProps = {
  lists: List[];
  total: number;
  viewState: DataTableViewState;
  paging: FittedListPagination;
  activeFilterCount: number;
  isRetrying: boolean;
  onClearFilters: () => void;
  onRetry: () => unknown;
  onOpenList: (list: List) => void;
};

const COLUMN_COUNT = ADMIN_LISTS_COLUMNS.length;

function getListRowId(list: List): string {
  return list.id;
}

function getListHref(list: List): string {
  return `/lists/${list.id}`;
}

function AdminListsSkeletonBody({ rowCount }: { rowCount: number }) {
  return (
    <tbody aria-hidden="true" className="[&_tr:last-child]:border-0">
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <tr key={rowIndex} className="h-16 border-b">
          <td className="p-2 align-middle">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52 max-w-full" />
            </div>
          </td>
          <td className="p-2 align-middle">
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </td>
          <td className="p-2 align-middle">
            <Skeleton className="h-5 w-20 rounded-4xl" />
          </td>
          <td className="p-2 align-middle">
            <Skeleton className="h-4 w-14" />
          </td>
          <td className="p-2 align-middle">
            <Skeleton className="h-4 w-8" />
          </td>
          <td className="p-2 align-middle">
            <Skeleton className="h-4 w-18" />
          </td>
          <td className="p-2 align-middle" />
        </tr>
      ))}
    </tbody>
  );
}

export function AdminListsTable({
  lists,
  total,
  viewState,
  paging,
  activeFilterCount,
  isRetrying,
  onClearFilters,
  onRetry,
  onOpenList,
}: AdminListsTableProps) {
  const { t } = useTranslation(["admin", "lists"]);
  const { pagination, autoPageSize, pageSizeOptions } = paging;
  const table = useTable({
    features: appTableFeatures,
    data: lists,
    columns: ADMIN_LISTS_COLUMNS,
    getRowId: getListRowId,
    manualPagination: true,
    rowCount: total,
    state: { pagination },
    onPaginationChange: paging.setPagination,
  });
  const emptyState: RecordListEmptyState =
    activeFilterCount > 0
      ? {
          icon: Search01Icon,
          title: t("lists:noSearchResults"),
          description: t("admin:users.list.empty.description"),
          action: <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="cursor-pointer" />,
        }
      : { icon: TaskDaily01Icon, title: t("admin:lists.empty.title"), description: t("admin:lists.empty.description") };

  if (paging.isMobile) {
    return (
      <div className="flex flex-col">
        <AdminListsMobileList
          lists={lists}
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
        <DataTable.Root table={table} className="block rounded-b-none border-b-0">
          <DataTable.Table>
            <DataTable.Header />
            {viewState === "loading" ? <AdminListsSkeletonBody rowCount={pagination.pageSize} /> : null}
            {viewState === "error" ? <DataTable.Error columns={COLUMN_COUNT} rows={autoPageSize} onRetry={onRetry} isRetrying={isRetrying} /> : null}
            {viewState === "empty" ? <DataTable.EmptyState columns={COLUMN_COUNT} rows={autoPageSize} {...emptyState} /> : null}
            {viewState === "ready" ? (
              <DataTable.Body onRowClick={onOpenList} getRowHref={getListHref} rowClassName="has-data-popup-open:bg-muted/50" />
            ) : null}
          </DataTable.Table>
        </DataTable.Root>
      </div>
      <DataTable.PaginationFooter>
        <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
      </DataTable.PaginationFooter>
    </div>
  );
}
