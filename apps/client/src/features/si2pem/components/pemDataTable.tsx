import { AirportTowerIcon, Location01Icon, MapsIcon, Radar01Icon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";

import { PEMStationTitle } from "./measurementSummary";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import type { PaginationState } from "@/hooks/useTablePageSize";
import { hasModifierKey } from "@/lib/dom/keyboard";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

export const PEM_MOBILE_ROW_HEIGHT = 113;
const MOBILE_SKELETON_ROWS = Array.from({ length: 12 }, (_, index) => index);
const MAP_HINT_CLASS_NAME =
  "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground";
const ROW_ACTION_CLASS_NAME = "relative z-10 text-muted-foreground group-hover:text-foreground";

type PEMRow = {
  station_id: string | null;
  internal_station_id: number | null;
  operator: { name: string } | null;
  location: { latitude: number; longitude: number; city: string; address: string };
};

function getPEMMapHref({ location }: Pick<PEMRow, "location">) {
  return `/#map=16.00/${location.latitude.toFixed(6)}/${location.longitude.toFixed(6)}~fp`;
}

function getPEMRowDescription(row: PEMRow, t: TFunction) {
  return [row.operator?.name, row.station_id, row.location.city || t("table.unknownCity"), row.location.address].filter(Boolean).join(", ");
}

export function getPEMRowContext(row: PEMRow, t: TFunction) {
  return row.station_id ?? (row.location.city || t("table.unknownCity"));
}

type PEMStationLinkProps = {
  stationId: number | null;
  context: string;
  t: TFunction;
  onOpen: (stationId: number) => void;
};

function PEMStationLink({ stationId, context, t, onOpen }: PEMStationLinkProps) {
  if (stationId === null) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={`/stations/${stationId}`}
            className={cn(buttonVariants({ variant: "ghost", size: "xs" }), ROW_ACTION_CLASS_NAME)}
            onClick={(event) => {
              if (hasModifierKey(event)) return;
              event.preventDefault();
              onOpen(stationId);
            }}
          />
        }
      >
        <HugeiconsIcon icon={AirportTowerIcon} data-icon="inline-start" aria-hidden="true" />
        {t("table.station")}
        <span className="sr-only"> {context}</span>
      </TooltipTrigger>
      <TooltipContent>{t("table.openStation")}</TooltipContent>
    </Tooltip>
  );
}

type PEMDocumentLinkProps = {
  href: string | null;
  label: string;
  context: string;
  icon: IconSvgElement;
};

export function PEMDocumentLink({ href, label, context, icon }: PEMDocumentLinkProps) {
  if (!href) return <span aria-hidden="true" className="size-6 shrink-0" />;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label} - ${context}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }), ROW_ACTION_CLASS_NAME)}
          />
        }
      >
        <HugeiconsIcon icon={icon} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type PEMLinksCellProps = {
  row: PEMRow;
  t: TFunction;
  tCommon: TFunction;
  onOpenStation: (stationId: number) => void;
  children: ReactNode;
};

export function PEMLinksCell({ row, t, tCommon, onOpenStation, children }: PEMLinksCellProps) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <PEMStationLink stationId={row.internal_station_id} context={getPEMRowContext(row, t)} t={t} onOpen={onOpenStation} />
      {children}
      <span aria-hidden="true" className={MAP_HINT_CLASS_NAME}>
        <HugeiconsIcon icon={MapsIcon} className="size-3.5" />
        {tCommon("labels.map")}
      </span>
    </div>
  );
}

type PEMMobileRowActionsProps = {
  row: PEMRow;
  t: TFunction;
  tCommon: TFunction;
  onOpenStation: (stationId: number) => void;
};

export function PEMMobileRowActions({ row, t, tCommon, onOpenStation }: PEMMobileRowActionsProps) {
  return (
    <div className="-my-0.5 flex shrink-0 items-center gap-1.5">
      <PEMStationLink stationId={row.internal_station_id} context={getPEMRowContext(row, t)} t={t} onOpen={onOpenStation} />
      <a
        href={getPEMMapHref(row)}
        aria-label={`${tCommon("labels.map")}: ${getPEMRowDescription(row, t)}`}
        className={cn(
          MAP_HINT_CLASS_NAME,
          "outline-none after:absolute after:inset-0 focus-visible:text-foreground focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
        )}
      >
        <HugeiconsIcon icon={MapsIcon} className="size-3.5" aria-hidden="true" />
        {tCommon("labels.map")}
      </a>
    </div>
  );
}

type PEMLocationCellProps = {
  city: string;
  regionName?: string | null;
  address: string;
  noAddressLabel: string;
};

export function PEMLocationCell({ city, regionName, address, noAddressLabel }: PEMLocationCellProps) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <HugeiconsIcon icon={Location01Icon} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium leading-tight">
          <span>{city}</span>
          {regionName ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">· {regionName}</span> : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">{address || noAddressLabel}</div>
      </div>
    </div>
  );
}

type PEMStationCellProps = {
  stationId: string | null;
  operator: { name: string; mnc?: number | null } | null;
  subtitle?: string | null;
};

export function PEMStationCell({ stationId, operator, subtitle }: PEMStationCellProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <PEMStationTitle stationId={stationId} operator={operator} />
      {subtitle ? (
        <span title={subtitle} className={cn("truncate text-xs text-muted-foreground", operator ? "pl-5.5" : null)}>
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}

function PEMMobileSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y" aria-hidden="true">
      {MOBILE_SKELETON_ROWS.slice(0, Math.min(rows, MOBILE_SKELETON_ROWS.length)).map((row) => (
        <div key={row} className="flex h-28 flex-col justify-center gap-3 px-3 py-2.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

type SharedTableProps<T> = {
  data: T[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  activeFilterCount: number;
  onClearFilters: () => void;
  onRetry: () => void;
  totalItems: number;
  pagination: PaginationState;
  autoPageSize: number;
  onPaginationChange: (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => void;
  pageSizeOptions: number[];
  t: TFunction;
  tCommon: TFunction;
  isMobile: boolean;
};

export type PEMDataTableProps<T> = SharedTableProps<T> & {
  locale: string;
  onOpenStation: (stationId: number) => void;
};

type PEMDataTableShellProps<T extends PEMRow> = SharedTableProps<T> & {
  columns: ColumnDef<AppTableFeatures, T>[];
  caption: string;
  getRowKey: (row: T) => string;
  renderMobileRow: (row: T) => ReactNode;
};

export function PEMDataTableShell<T extends PEMRow>({
  data,
  isLoading,
  isError,
  isFetching,
  activeFilterCount,
  onClearFilters,
  onRetry,
  totalItems,
  pagination,
  autoPageSize,
  onPaginationChange,
  pageSizeOptions,
  t,
  tCommon,
  isMobile,
  columns,
  caption,
  getRowKey,
  renderMobileRow,
}: PEMDataTableShellProps<T>) {
  const table = useTable({
    features: appTableFeatures,
    data,
    columns,
    manualPagination: true,
    pageCount: Math.ceil(totalItems / pagination.pageSize),
    state: { pagination },
    onPaginationChange,
  });

  const hasRows = data.length > 0;
  const viewState = getDataTableViewState(isLoading, isError && !hasRows, hasRows);
  const isUpdating = isFetching && !isLoading && !isError;
  const hasActiveFilters = activeFilterCount > 0;
  const emptyIcon = hasActiveFilters ? SearchRemoveIcon : Radar01Icon;
  const emptyDescription = hasActiveFilters ? t("states.emptyFiltered") : undefined;
  const emptyAction = hasActiveFilters ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} /> : undefined;
  const getRowAriaLabel = (row: T) => `${getPEMRowDescription(row, t)}, ${tCommon("actions.showOnMap")}`;

  return (
    <div className="custom-scrollbar relative h-full min-h-0 overflow-x-hidden overflow-y-auto" aria-busy={isLoading || isFetching}>
      <span className="sr-only" role="status" aria-live="polite">
        {viewState === "loading" ? t("states.loading") : ""}
      </span>

      {isError && hasRows ? (
        <StaleDataNotice onRetry={onRetry} isRetrying={isFetching} className={isMobile ? "mb-2" : "absolute right-2 top-2 z-20"} />
      ) : null}

      {isMobile ? (
        <div className="flex flex-col">
          <div className="relative overflow-hidden rounded-t-lg border border-b-0 bg-card">
            {isUpdating ? <DataTable.UpdatingIndicator /> : null}
            {viewState === "loading" ? <PEMMobileSkeleton rows={pagination.pageSize} /> : null}
            {viewState === "error" ? (
              <div className="flex flex-col p-3" style={{ minHeight: autoPageSize * PEM_MOBILE_ROW_HEIGHT }}>
                <ErrorState className="flex-1" title={t("states.errorTitle")} onRetry={onRetry} isRetrying={isFetching} />
              </div>
            ) : null}
            {viewState === "empty" ? (
              <div role="status" className="flex flex-col p-3" style={{ minHeight: autoPageSize * PEM_MOBILE_ROW_HEIGHT }}>
                <ErrorState
                  tone="neutral"
                  className="flex-1"
                  icon={emptyIcon}
                  title={t("states.emptyTitle")}
                  description={emptyDescription}
                  action={emptyAction}
                />
              </div>
            ) : null}
            {viewState === "ready" ? (
              <ul className="divide-y">
                {data.map((row) => (
                  <li key={getRowKey(row)}>
                    <div className="group relative h-28 overflow-hidden px-3 py-2.5 transition-colors hover:bg-muted/50">{renderMobileRow(row)}</div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <DataTable.PaginationFooter>
            <DataTablePagination table={table} totalItems={totalItems} pageSizeOptions={pageSizeOptions} showRowsPerPage={false} />
          </DataTable.PaginationFooter>
        </div>
      ) : (
        <div className="relative min-w-full">
          {isUpdating ? <DataTable.UpdatingIndicator /> : null}
          <div className="custom-scrollbar overflow-x-auto overflow-y-hidden">
            <DataTable.Root table={table} className="block rounded-b-none border-b-0">
              <DataTable.Table>
                <caption className="sr-only">{caption}</caption>
                <DataTable.Header />
                {viewState === "loading" ? <DataTable.Skeleton rows={pagination.pageSize} columns={columns.length} /> : null}
                {viewState === "error" ? (
                  <DataTable.Error
                    columns={columns.length}
                    rows={autoPageSize}
                    title={t("states.errorTitle")}
                    onRetry={onRetry}
                    isRetrying={isFetching}
                  />
                ) : null}
                {viewState === "empty" ? (
                  <DataTable.EmptyState
                    columns={columns.length}
                    rows={autoPageSize}
                    icon={emptyIcon}
                    title={t("states.emptyTitle")}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                ) : null}
                {viewState === "ready" ? <DataTable.Body getRowHref={getPEMMapHref} getRowAriaLabel={getRowAriaLabel} rowClassName="group" /> : null}
              </DataTable.Table>
            </DataTable.Root>
          </div>
          <DataTable.PaginationFooter>
            <DataTablePagination table={table} totalItems={totalItems} pageSizeOptions={pageSizeOptions} />
          </DataTable.PaginationFooter>
        </div>
      )}
    </div>
  );
}
