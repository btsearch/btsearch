import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { cn } from "@/lib/utils";
import type { Station, StationSortBy, StationSortDirection } from "@/types/station";

import { createStationsColumns } from "./stationsColumns";

const TABLE_PAGINATION_CONFIG = { rowHeight: 64, headerHeight: 40, paginationHeight: 45 };

interface StationsDataTableProps {
  data: Station[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  onRowClick?: (station: Station) => void;
  getRowHref?: (station: Station) => string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  totalItems?: number;
  isSearchActive?: boolean;
  sort: StationSortDirection;
  sortBy: StationSortBy | undefined;
  onSort: (column: StationSortBy) => void;
}

export function StationsDataTable({
  data,
  isLoading,
  isFetchingMore,
  onRowClick,
  getRowHref,
  onLoadMore,
  hasMore,
  totalItems,
  isSearchActive = false,
  sort,
  sortBy,
  onSort,
}: StationsDataTableProps) {
  "use no memo";
  const { t, i18n } = useTranslation("main");
  const { t: tCommon } = useTranslation("common");

  const { containerRef, pagination, setPagination, autoPageSize, pageSizeOptions } = useTablePagination(TABLE_PAGINATION_CONFIG);

  const columns = useMemo(
    () => createStationsColumns({ t: tCommon, locale: i18n.language, isSearchActive, sort, sortBy, onSort }),
    [tCommon, i18n.language, isSearchActive, sort, sortBy, onSort],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
  });

  const pageCount = table.getPageCount();
  const columnCount = columns.length;

  useEffect(() => {
    if (hasMore && onLoadMore && pagination.pageIndex + 1 >= pageCount - 2) onLoadMore();
  }, [pagination.pageIndex, pageCount, hasMore, onLoadMore]);

  const showSkeleton = isLoading && data.length === 0;
  const isEmpty = !isLoading && table.getRowModel().rows.length === 0;

  const currentPageRows = table.getRowModel().rows.length;
  const isOnLastLoadedPage = pagination.pageIndex === pageCount - 1;
  const skeletonRowsToShow =
    isFetchingMore && hasMore && isOnLastLoadedPage && currentPageRows < pagination.pageSize ? pagination.pageSize - currentPageRows : 0;

  return (
    <div
      ref={containerRef}
      className={cn("flex-1 min-h-0 max-md:mb-10 overflow-x-auto", pagination.pageSize > autoPageSize ? "overflow-y-auto" : "overflow-y-clip")}
    >
      <DataTable.Root table={table}>
        <DataTable.Table>
          <DataTable.Header />
          {showSkeleton ? (
            <DataTable.Skeleton rows={pagination.pageSize} columns={columnCount} />
          ) : isEmpty ? (
            <tbody>
              <DataTable.Empty columns={columnCount}>
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <span>{t("search.noResults")}</span>
                  <span className="text-sm">{t("search.noResultsHint")}</span>
                </div>
              </DataTable.Empty>
            </tbody>
          ) : (
            <DataTable.Body onRowClick={onRowClick} getRowHref={getRowHref} skeletonRows={skeletonRowsToShow} skeletonColumns={columnCount} />
          )}
          <DataTable.Footer columns={columnCount}>
            <DataTablePagination table={table} totalItems={totalItems ?? data.length} pageSizeOptions={pageSizeOptions} />
          </DataTable.Footer>
        </DataTable.Table>
      </DataTable.Root>
    </div>
  );
}
