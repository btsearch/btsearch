import { type PaginationState, useTable } from "@tanstack/react-table";
import { type Ref, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { AdminComment } from "../types";
import { createCommentsColumns } from "./commentsColumns";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { StaleDataNotice } from "@/components/ui/error-state";
import { appTableFeatures } from "@/lib/tableFeatures";

interface CommentsDataTableProps {
  data: AdminComment[];
  isLoading?: boolean;
  isError?: boolean;
  isRetrying?: boolean;
  onRetry?: () => unknown;
  total: number;
  containerRef: Ref<HTMLDivElement>;
  pagination: PaginationState;
  autoPageSize: number;
  setPagination: (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => void;
  pageSizeOptions?: number[];
  sortBy: "createdAt" | "id";
  sort: "asc" | "desc";
  onSort: (col: "createdAt" | "id") => void;
  onEdit: (comment: AdminComment) => void;
  onDelete: (comment: AdminComment) => void;
  onApprove: (comment: AdminComment) => void;
  onOpenLightbox: (comment: AdminComment, index: number) => void;
}

export function CommentsDataTable({
  data,
  isLoading,
  isError,
  isRetrying,
  onRetry,
  total,
  containerRef,
  pagination,
  autoPageSize,
  setPagination,
  pageSizeOptions,
  sortBy,
  sort,
  onSort,
  onEdit,
  onDelete,
  onApprove,
  onOpenLightbox,
}: CommentsDataTableProps) {
  "use no memo";
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");

  const columns = useMemo(
    () => createCommentsColumns({ t, tCommon, locale: i18n.language, sortBy, sort, onSort, onEdit, onDelete, onApprove, onOpenLightbox }),
    [t, tCommon, i18n.language, sortBy, sort, onSort, onEdit, onDelete, onApprove, onOpenLightbox],
  );
  const sorting = useMemo(() => [{ id: sortBy, desc: sort === "desc" }], [sort, sortBy]);

  const table = useTable({
    features: appTableFeatures,
    data,
    columns,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
  });

  const columnCount = columns.length;
  const hasRows = data.length > 0;
  const viewState = getDataTableViewState(Boolean(isLoading) && !hasRows, Boolean(isError) && !hasRows, hasRows);

  return (
    <div ref={containerRef} className="custom-scrollbar relative h-full min-h-0 overflow-x-hidden overflow-y-auto">
      {isError && hasRows ? <StaleDataNotice onRetry={onRetry} isRetrying={isRetrying} className="absolute right-2 top-2 z-20" /> : null}
      <div className="custom-scrollbar overflow-x-auto overflow-y-hidden">
        <DataTable.Root table={table} className="block rounded-b-none border-b-0">
          <DataTable.Table>
            <DataTable.Header />
            {viewState === "loading" ? <DataTable.Skeleton rows={pagination.pageSize} columns={columnCount} /> : null}
            {viewState === "error" ? <DataTable.Error columns={columnCount} rows={autoPageSize} onRetry={onRetry} isRetrying={isRetrying} /> : null}
            {viewState === "empty" ? (
              <tbody>
                <DataTable.Empty columns={columnCount}>
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <span>{t("comments.table.empty")}</span>
                    <span className="text-sm">{t("comments.table.emptyHint")}</span>
                  </div>
                </DataTable.Empty>
              </tbody>
            ) : null}
            {viewState === "ready" ? <DataTable.Body /> : null}
          </DataTable.Table>
        </DataTable.Root>
      </div>
      <DataTable.PaginationFooter>
        <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
      </DataTable.PaginationFooter>
    </div>
  );
}
