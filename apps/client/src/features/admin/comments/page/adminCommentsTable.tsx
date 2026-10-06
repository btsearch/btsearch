import { CheckmarkCircle02Icon, Message01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import type { Comment } from "@openbts/shared/contract";
import { useTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { useAdminCommentActions } from "./adminCommentActions";
import { ADMIN_COMMENTS_COLUMNS, ADMIN_COMMENTS_SORTING } from "./adminCommentsColumns";
import { AdminCommentsMobileList } from "./adminCommentsMobileList";
import type { AdminCommentsQueue } from "./commentsSearch";
import { DataTable, type DataTableViewState } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecordListEmptyState } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import type { FittedListPagination } from "@/hooks/useFittedListPagination";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

type AdminCommentsTableProps = {
  comments: Comment[];
  total: number;
  viewState: DataTableViewState;
  paging: FittedListPagination;
  queue: AdminCommentsQueue;
  activeFilterCount: number;
  isRetrying: boolean;
  onClearFilters: () => void;
  onRetry: () => unknown;
};

const COLUMN_COUNT = ADMIN_COMMENTS_COLUMNS.length;
const SKELETON_BAR_WIDTHS = ["w-24", "w-60", "w-20", "w-18", "w-20"];

function getCommentRowId(comment: Comment): string {
  return comment.id;
}

function AdminCommentsSkeletonBody({ rowCount }: { rowCount: number }) {
  return (
    <tbody aria-hidden="true" className="[&_tr:last-child]:border-0">
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <tr key={rowIndex} className="h-16 border-b">
          <td className="p-2 align-middle">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </td>
          {SKELETON_BAR_WIDTHS.map((width, columnIndex) => (
            <td key={columnIndex} className="p-2 align-middle">
              <Skeleton className={cn("h-4 max-w-full", width)} />
            </td>
          ))}
          <td className="p-2 align-middle" />
        </tr>
      ))}
    </tbody>
  );
}

export function AdminCommentsTable({
  comments,
  total,
  viewState,
  paging,
  queue,
  activeFilterCount,
  isRetrying,
  onClearFilters,
  onRetry,
}: AdminCommentsTableProps) {
  const { t } = useTranslation(["admin", "common"]);
  const { sort, onOpen } = useAdminCommentActions();
  const { pagination, autoPageSize, pageSizeOptions } = paging;
  const table = useTable({
    features: appTableFeatures,
    data: comments,
    columns: ADMIN_COMMENTS_COLUMNS,
    getRowId: getCommentRowId,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    state: { pagination, sorting: ADMIN_COMMENTS_SORTING[sort] },
    onPaginationChange: paging.setPagination,
  });

  let emptyState: RecordListEmptyState = {
    icon: Message01Icon,
    title: t("common:empty.comments"),
    description: t("admin:comments.table.emptyHint"),
  };
  if (activeFilterCount > 0) {
    emptyState = {
      icon: Search01Icon,
      title: t("admin:comments.empty.noMatchTitle"),
      description: t("admin:users.list.empty.description"),
      action: <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="cursor-pointer" />,
    };
  } else if (queue === "pending") {
    emptyState = {
      icon: CheckmarkCircle02Icon,
      title: t("admin:dashboard.queueClear"),
      description: t("admin:comments.empty.queueDescription"),
    };
  }

  if (paging.isMobile) {
    return (
      <div className="flex flex-col">
        <AdminCommentsMobileList comments={comments} viewState={viewState} emptyState={emptyState} isRetrying={isRetrying} onRetry={onRetry} />
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
            {viewState === "loading" ? <AdminCommentsSkeletonBody rowCount={pagination.pageSize} /> : null}
            {viewState === "error" ? <DataTable.Error columns={COLUMN_COUNT} rows={autoPageSize} onRetry={onRetry} isRetrying={isRetrying} /> : null}
            {viewState === "empty" ? <DataTable.EmptyState columns={COLUMN_COUNT} rows={autoPageSize} {...emptyState} /> : null}
            {viewState === "ready" ? <DataTable.Body onRowClick={onOpen} /> : null}
          </DataTable.Table>
        </DataTable.Root>
      </div>
      <DataTable.PaginationFooter>
        <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
      </DataTable.PaginationFooter>
    </div>
  );
}
