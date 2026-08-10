import { type PaginationState, useTable } from "@tanstack/react-table";
import { type Ref, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { appTableFeatures } from "@/lib/tableFeatures";

import type { AdminComment } from "../types";
import { createCommentsColumns } from "./commentsColumns";

interface CommentsDataTableProps {
  data: AdminComment[];
  isLoading?: boolean;
  total: number;
  containerRef: Ref<HTMLDivElement>;
  pagination: PaginationState;
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
  total,
  containerRef,
  pagination,
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

  const table = useTable({
    features: appTableFeatures,
    data,
    columns,
    manualPagination: true,
    rowCount: total,
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const columnCount = columns.length;
  const showSkeleton = isLoading && data.length === 0;
  const isEmpty = !isLoading && data.length === 0;

  return (
    <div ref={containerRef} className="h-full overflow-x-auto overflow-y-auto">
      <DataTable.Root table={table}>
        <DataTable.Table>
          <DataTable.Header />
          {showSkeleton ? (
            <DataTable.Skeleton rows={pagination.pageSize} columns={columnCount} />
          ) : isEmpty ? (
            <tbody>
              <DataTable.Empty columns={columnCount}>
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <span>{t("comments.table.empty")}</span>
                  <span className="text-sm">{t("comments.table.emptyHint")}</span>
                </div>
              </DataTable.Empty>
            </tbody>
          ) : (
            <DataTable.Body />
          )}
          <DataTable.Footer columns={columnCount}>
            <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
          </DataTable.Footer>
        </DataTable.Table>
      </DataTable.Root>
    </div>
  );
}
