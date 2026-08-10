import { useTable } from "@tanstack/react-table";
import { type Dispatch, type Ref, type SetStateAction, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { appTableFeatures } from "@/lib/tableFeatures";
import type { UkeStation } from "@/types/station";

import { createUnassignedPermitsColumns } from "./columns";

interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

interface UnassignedPermitsDataTableProps {
  data: UkeStation[];
  isLoading?: boolean;
  onOpenDetails?: (station: UkeStation) => void;
  onViewOnMap?: (station: UkeStation) => void;
  totalItems: number;
  containerRef: Ref<HTMLDivElement>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  pageSizeOptions?: number[];
}

export function UnassignedPermitsDataTable({
  data,
  isLoading,
  onOpenDetails,
  totalItems,
  containerRef,
  pagination,
  setPagination,
  pageSizeOptions,
}: UnassignedPermitsDataTableProps) {
  "use no memo";
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");

  const columns = useMemo(() => createUnassignedPermitsColumns({ t, tCommon }), [t, tCommon]);

  const table = useTable({
    features: appTableFeatures,
    data,
    columns,
    manualPagination: true,
    pageCount: Math.ceil(totalItems / pagination.pageSize),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const columnCount = columns.length;
  const showSkeleton = isLoading;
  const isEmpty = !isLoading && table.getRowModel().rows.length === 0;

  const handleRowClick = useCallback((station: UkeStation) => onOpenDetails?.(station), [onOpenDetails]);

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
                  <span>{t("main:search.noResults")}</span>
                  <span className="text-sm">{t("main:search.noResultsHint")}</span>
                </div>
              </DataTable.Empty>
            </tbody>
          ) : (
            <DataTable.Body onRowClick={handleRowClick} />
          )}
          <DataTable.Footer columns={columnCount}>
            <div className="sticky left-0">
              <DataTablePagination table={table} totalItems={totalItems} pageSizeOptions={pageSizeOptions} />
            </div>
          </DataTable.Footer>
        </DataTable.Table>
      </DataTable.Root>
    </div>
  );
}
