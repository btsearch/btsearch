import { AirportTowerIcon, AlertCircleIcon, MapPinIcon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTable } from "@tanstack/react-table";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DATA_TABLE_HEADER_HEIGHT,
  DATA_TABLE_PAGINATION_HEIGHT,
  DATA_TABLE_ROW_HEIGHT,
  DataTable,
  getDataTableViewState,
} from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useMeasuredListRowHeight } from "@/hooks/useMeasuredListRowHeight";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { getOperatorColor } from "@/lib/cellular/operators";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";
import type { LocationSortBy, LocationSortDirection, LocationWithStations } from "@/types/station";

import { createLocationsColumns, getLocationOperators } from "./locationsColumns";

const DESKTOP_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
};
const MOBILE_PAGINATION_CONFIG = {
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
};
const MOBILE_ROW_HEIGHT_FALLBACK = 120;

interface LocationsDataTableProps {
  data: LocationWithStations[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  isError?: boolean;
  onRetry?: () => unknown;
  onRowClick?: (location: LocationWithStations) => void;
  getRowHref?: (location: LocationWithStations) => string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  totalItems?: number;
  sort: LocationSortDirection;
  sortBy: LocationSortBy | undefined;
  onSort: (column: LocationSortBy) => void;
}

type MobileSortButtonProps = {
  label: string;
  directionLabel: string;
  column: LocationSortBy;
  sort: LocationSortDirection;
  sortBy: LocationSortBy | undefined;
  onSort: (column: LocationSortBy) => void;
};

function MobileSortButton({ label, directionLabel, column, sort, sortBy, onSort }: MobileSortButtonProps) {
  const active = sortBy === column;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      aria-label={`${label}: ${directionLabel}`}
      aria-pressed={active}
      onClick={() => onSort(column)}
    >
      {label}
      <HugeiconsIcon
        icon={Sorting05Icon}
        aria-hidden="true"
        className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground/40")}
        style={active && sort === "asc" ? { transform: "scaleY(-1)" } : undefined}
      />
    </button>
  );
}

function LocationMobileRow({
  location,
  locale,
  onRowClick,
  getRowHref,
}: {
  location: LocationWithStations;
  locale: string;
  onRowClick?: (location: LocationWithStations) => void;
  getRowHref?: (location: LocationWithStations) => string;
}) {
  const { t } = useTranslation("common");
  const operators = getLocationOperators(location);
  const operatorNames = operators.map((operator) => operator.name).join(", ");
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <HugeiconsIcon icon={MapPinIcon} className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium group-hover:underline group-focus-visible:underline">{location.city || "-"}</span>
          </div>
          <div className="mt-1 truncate pl-5.5 text-xs text-muted-foreground">{location.address || "-"}</div>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">#{location.id}</span>
      </div>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {location.region?.name || "-"}
          <span className="mx-1.5 text-muted-foreground/40">/</span>
          <span className="font-mono tabular-nums">
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          </span>
        </span>
        <time className="shrink-0" dateTime={location.updatedAt} title={formatFullDate(location.updatedAt, locale)}>
          {formatRelativeTime(location.updatedAt, t)}
        </time>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2 border-t pt-2 text-xs">
        <span className="inline-flex shrink-0 items-center gap-1 font-medium">
          <HugeiconsIcon icon={AirportTowerIcon} className="size-3.5 text-muted-foreground" />
          {location.stations?.length ?? 0}
        </span>
        {operators.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
              {operators.map((operator) => (
                <span key={operator.id} className="size-2.5 rounded-[2px]" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
              ))}
            </span>
            <span className="truncate">{operatorNames}</span>
          </span>
        ) : null}
      </div>
    </>
  );
  const className =
    "group block w-full p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  const ariaLabel = [`#${location.id}`, location.city, location.address, location.region?.name, operatorNames].filter(Boolean).join(" ");
  const href = getRowHref?.(location);

  if (href)
    return (
      <a
        href={href}
        className={className}
        aria-label={ariaLabel}
        onClick={(event) => {
          if (!onRowClick || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onRowClick(location);
        }}
      >
        {content}
      </a>
    );

  return <div className={className}>{content}</div>;
}

function LoadError({ onRetry }: { onRetry?: () => unknown }) {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border bg-card px-4 text-center text-muted-foreground" role="alert">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/5 text-destructive/70">
        <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
      </div>
      <p className="font-medium text-foreground">{t("error.title")}</p>
      <p className="mt-1 max-w-md text-sm">{t("error.description")}</p>
      <Button type="button" variant="outline" className="mt-4" onClick={() => void onRetry?.()}>
        {t("actions.retry")}
      </Button>
    </div>
  );
}

export function LocationsDataTable({
  data,
  isLoading,
  isFetchingMore,
  isError,
  onRetry,
  onRowClick,
  getRowHref,
  onLoadMore,
  hasMore,
  totalItems,
  sort,
  sortBy,
  onSort,
}: LocationsDataTableProps) {
  "use no memo";
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const isMobile = useIsMobile();
  const { listRef, rowHeight: mobileRowHeight } = useMeasuredListRowHeight(MOBILE_ROW_HEIGHT_FALLBACK);
  const desktopPagination = useTablePagination(DESKTOP_PAGINATION_CONFIG);
  const mobilePagination = useTablePagination({ ...MOBILE_PAGINATION_CONFIG, rowHeight: mobileRowHeight });
  const { containerRef, pagination, setPagination, pageSizeOptions } = isMobile ? mobilePagination : desktopPagination;

  const columns = useMemo(
    () => createLocationsColumns({ t, tCommon, locale: i18n.language, sort, sortBy, onSort }),
    [t, tCommon, i18n.language, sort, sortBy, onSort],
  );
  const sorting = useMemo(() => (sortBy ? [{ id: sortBy, desc: sort === "desc" }] : []), [sort, sortBy]);

  const table = useTable({
    features: appTableFeatures,
    data,
    columns,
    manualSorting: true,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
  });

  const pageCount = table.getPageCount();
  const columnCount = columns.length;

  useEffect(() => {
    if (hasMore && onLoadMore && pagination.pageIndex + 1 >= pageCount - 2) onLoadMore();
  }, [pagination.pageIndex, pageCount, hasMore, onLoadMore]);

  useEffect(() => {
    const lastPageIndex = Math.max(0, pageCount - 1);
    if (pagination.pageIndex > lastPageIndex) table.setPageIndex(lastPageIndex);
  }, [pageCount, pagination.pageIndex, table]);

  const hasRows = data.length > 0;
  const viewState = getDataTableViewState(Boolean(isLoading) && !isError && !hasRows, Boolean(isError) && !hasRows, hasRows);
  const showPaginationFooter = viewState !== "error";
  const currentPageRows = table.getRowModel().rows.length;
  const isOnLastLoadedPage = pagination.pageIndex === pageCount - 1;
  const skeletonRowsToShow =
    isFetchingMore && hasMore && isOnLastLoadedPage && currentPageRows < pagination.pageSize ? pagination.pageSize - currentPageRows : 0;
  const activeSortDirectionLabel = sort === "asc" ? tCommon("sorting.ascending") : tCommon("sorting.descending");

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 max-md:mb-10">
      {isError && hasRows ? (
        <div
          className="absolute left-1/2 top-12 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm dark:bg-amber-950 dark:text-amber-200"
          role="status"
        >
          <span className="truncate">{tCommon("error.staleData")}</span>
          <button type="button" className="shrink-0 underline underline-offset-2 hover:no-underline" onClick={() => void onRetry?.()}>
            {tCommon("actions.retry")}
          </button>
        </div>
      ) : null}

      {isMobile ? (
        <div className="max-h-full overflow-y-auto">
          {viewState === "error" ? (
            <LoadError onRetry={onRetry} />
          ) : (
            <div className={cn("overflow-hidden rounded-lg border bg-card", showPaginationFooter && "rounded-b-none border-b-0")}>
              <div className="flex h-10 items-center gap-1 border-b bg-muted/20 px-2">
                <MobileSortButton
                  label={tCommon("labels.id")}
                  directionLabel={sortBy === "id" ? activeSortDirectionLabel : tCommon("sorting.none")}
                  column="id"
                  sort={sort}
                  sortBy={sortBy}
                  onSort={onSort}
                />
                <MobileSortButton
                  label={tCommon("labels.updated")}
                  directionLabel={sortBy === "updatedAt" ? activeSortDirectionLabel : tCommon("sorting.none")}
                  column="updatedAt"
                  sort={sort}
                  sortBy={sortBy}
                  onSort={onSort}
                />
              </div>
              {viewState === "loading" ? (
                <div className="divide-y" aria-hidden="true">
                  {Array.from({ length: Math.min(pagination.pageSize, 6) }, (_, index) => (
                    <div key={index} className="space-y-3 p-3">
                      <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : null}
              {viewState === "empty" ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground" role="status">
                  <span>{t("main:search.noResults")}</span>
                  <span className="text-sm">{t("main:search.noResultsHint")}</span>
                </div>
              ) : null}
              {viewState === "ready" ? (
                <ul ref={listRef} className="divide-y">
                  {table.getRowModel().rows.map((row) => (
                    <li key={row.id}>
                      <LocationMobileRow location={row.original} locale={i18n.language} onRowClick={onRowClick} getRowHref={getRowHref} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          {showPaginationFooter ? (
            <DataTable.PaginationFooter>
              <DataTablePagination table={table} totalItems={totalItems ?? data.length} pageSizeOptions={pageSizeOptions} showRowsPerPage={false} />
            </DataTable.PaginationFooter>
          ) : null}
        </div>
      ) : (
        <div className="h-full">
          {viewState === "error" ? (
            <LoadError onRetry={onRetry} />
          ) : (
            <>
              <div className={cn("overflow-auto", showPaginationFooter ? "max-h-[calc(100%-49px)]" : "max-h-full")}>
                <div className="min-w-275">
                  <DataTable.Root table={table} className={cn("block", showPaginationFooter && "rounded-b-none border-b-0")}>
                    <DataTable.Table>
                      <DataTable.Header />
                      {viewState === "loading" ? <DataTable.Skeleton rows={pagination.pageSize} columns={columnCount} /> : null}
                      {viewState === "empty" ? (
                        <tbody>
                          <DataTable.Empty columns={columnCount}>
                            <div className="flex flex-col items-center gap-2 text-muted-foreground" role="status">
                              <span>{t("main:search.noResults")}</span>
                              <span className="text-sm">{t("main:search.noResultsHint")}</span>
                            </div>
                          </DataTable.Empty>
                        </tbody>
                      ) : null}
                      {viewState === "ready" ? (
                        <DataTable.Body
                          onRowClick={onRowClick}
                          getRowHref={getRowHref}
                          getRowAriaLabel={(location) =>
                            [
                              `#${location.id}`,
                              location.city,
                              location.address,
                              location.region?.name,
                              ...getLocationOperators(location).map((operator) => operator.name),
                            ]
                              .filter(Boolean)
                              .join(" ")
                          }
                          skeletonRows={skeletonRowsToShow}
                          skeletonColumns={columnCount}
                        />
                      ) : null}
                    </DataTable.Table>
                  </DataTable.Root>
                </div>
              </div>
              {showPaginationFooter ? (
                <DataTable.PaginationFooter>
                  <DataTablePagination table={table} totalItems={totalItems ?? data.length} pageSizeOptions={pageSizeOptions} />
                </DataTable.PaginationFooter>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
