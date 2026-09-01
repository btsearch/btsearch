import AlertCircleIcon from "@hugeicons/core-free-icons/AlertCircleIcon";
import Location01Icon from "@hugeicons/core-free-icons/Location01Icon";
import MapsIcon from "@hugeicons/core-free-icons/MapsIcon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { useCallback, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Spinner } from "@/components/ui/spinner";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import type { PaginationState } from "@/hooks/useTablePageSize";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";

import type { PlannedPEMStation } from "../api";
import { MeasurementSummary, getMeasurementDate } from "./measurementSummary";

type Props = {
  data: PlannedPEMStation[];
  status: PlannedPEMStation["status"];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  hasActiveFilters: boolean;
  onRetry: () => void;
  totalItems: number;
  pagination: PaginationState;
  onPaginationChange: (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => void;
  pageSizeOptions: number[];
  t: TFunction;
  tCommon: TFunction;
  locale: string;
  isMobile: boolean;
};

const MOBILE_SKELETON_ROWS = Array.from({ length: 12 }, (_, index) => index);

function getMeasurementMapHref(measurement: PlannedPEMStation) {
  const { latitude, longitude } = measurement.location;
  return `/#map=16.00/${latitude.toFixed(6)}/${longitude.toFixed(6)}~fp`;
}

function getMeasurementKey(measurement: PlannedPEMStation) {
  if (measurement.id !== null) return String(measurement.id);
  return [
    measurement.station_id,
    measurement.operator?.mnc,
    measurement.location.latitude,
    measurement.location.longitude,
    measurement.status,
    measurement.disabled_date,
    measurement.date?.from,
    measurement.date?.to,
    measurement.lab?.PCA,
  ].join(":");
}

function MeasurementMobileSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y" aria-hidden="true">
      {MOBILE_SKELETON_ROWS.slice(0, Math.min(rows, MOBILE_SKELETON_ROWS.length)).map((row) => (
        <div key={row} className="flex h-28 flex-col justify-center gap-3 px-3 py-2.5">
          <div className="h-4 w-36 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

type MobileRowProps = {
  measurement: PlannedPEMStation;
  locale: string;
  t: TFunction;
  tCommon: TFunction;
};

function MeasurementMobileRow({ measurement, locale, t, tCommon }: MobileRowProps) {
  return (
    <a
      href={getMeasurementMapHref(measurement)}
      className="group block h-28 overflow-hidden px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <MeasurementSummary
        measurement={measurement}
        locale={locale}
        unknownCityLabel={t("table.unknownCity")}
        noAddressLabel={tCommon("notFound.address")}
        stationIdClassName="underline-offset-2 group-hover:underline group-focus-visible:underline"
        action={
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
            <HugeiconsIcon icon={MapsIcon} className="size-3.5" aria-hidden="true" />
            {tCommon("labels.map")}
          </span>
        }
      />
    </a>
  );
}

export function MeasurementsDataTable({
  data,
  status,
  isLoading,
  isError,
  isFetching,
  hasActiveFilters,
  onRetry,
  totalItems,
  pagination,
  onPaginationChange,
  pageSizeOptions,
  t,
  tCommon,
  locale,
  isMobile,
}: Props) {
  const columns = useMemo<ColumnDef<AppTableFeatures, PlannedPEMStation>[]>(() => {
    const measurementColumns: ColumnDef<AppTableFeatures, PlannedPEMStation>[] = [
      {
        id: "measurementDate",
        header: status === "INACTIVE" ? t("table.disabledDate") : t("table.measurementDate"),
        size: 180,
        cell: ({ row }) => <span className="text-sm text-muted-foreground tabular-nums">{getMeasurementDate(row.original, locale)}</span>,
      },
    ];

    if (status !== "INACTIVE")
      measurementColumns.push({
        accessorKey: "lab.name",
        header: t("table.lab"),
        size: 200,
        cell: ({ getValue }) => <span className="block truncate text-sm text-muted-foreground">{getValue<string | null>() ?? "-"}</span>,
      });

    return [
      {
        accessorKey: "station_id",
        header: tCommon("labels.stationId"),
        size: 100,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm font-medium text-foreground underline-offset-2 group-hover:underline group-focus-within:underline">
            {getValue<string | null>() ?? "-"}
          </span>
        ),
      },
      {
        accessorKey: "operator",
        header: tCommon("labels.operator"),
        size: 210,
        cell: ({ row }) => {
          const operator = row.original.operator;
          if (!operator) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <DialogOperatorName name={operator.name} mnc={operator.mnc} compact />
              {operator.full_name !== operator.name ? (
                <span className="truncate pl-5.5 text-xs text-muted-foreground">{operator.full_name}</span>
              ) : null}
            </div>
          );
        },
      },
      ...measurementColumns,
      {
        accessorKey: "location",
        header: tCommon("labels.location"),
        size: 300,
        cell: ({ row }) => {
          const measurement = row.original;
          const city = measurement.location.city || t("table.unknownCity");
          const regionName = measurement.region?.name;
          const address = measurement.location.address;
          return (
            <div className="flex min-w-0 items-start gap-2">
              <HugeiconsIcon icon={Location01Icon} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium leading-tight">
                  <span>{city}</span>
                  {regionName ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">· {regionName}</span> : null}
                </div>
                <a
                  href={getMeasurementMapHref(measurement)}
                  aria-label={`${tCommon("actions.showOnMap")}: ${address || city}`}
                  className="block truncate text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
                >
                  {address || tCommon("notFound.address")}
                </a>
              </div>
            </div>
          );
        },
      },
    ];
  }, [t, tCommon, locale, status]);

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
  const getRowAriaLabel = useCallback(
    (measurement: PlannedPEMStation) => {
      const city = measurement.location.city || t("table.unknownCity");
      return [measurement.operator?.name, measurement.station_id, city, measurement.location.address, tCommon("actions.showOnMap")]
        .filter(Boolean)
        .join(", ");
    },
    [t, tCommon],
  );

  return (
    <div className="custom-scrollbar relative h-full min-h-0 overflow-x-hidden overflow-y-auto" aria-busy={isLoading || isFetching}>
      <span className="sr-only" role="status" aria-live="polite">
        {viewState === "loading" ? t("states.loading") : ""}
      </span>

      {isError && hasRows ? (
        <div
          className={
            isMobile
              ? "relative mb-2 ml-auto inline-flex w-fit max-w-full items-center gap-2 rounded-md border border-destructive/30 bg-background px-2 py-1 text-xs text-destructive"
              : "absolute right-2 top-2 z-20 inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-background/95 px-2 py-1 text-xs text-destructive shadow-sm"
          }
          role="alert"
        >
          <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" aria-hidden="true" />
          {tCommon("error.staleData")}
          <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
            {tCommon("actions.retry")}
          </Button>
        </div>
      ) : isFetching && !isLoading ? (
        <div
          className={
            isMobile
              ? "relative mb-2 ml-auto inline-flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground"
              : "absolute right-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-md border bg-background/95 px-2 py-1 text-xs text-muted-foreground shadow-sm"
          }
          role="status"
        >
          <Spinner className="size-3.5" aria-hidden="true" />
          {tCommon("actions.updating")}
        </div>
      ) : null}

      {isMobile ? (
        <div className="flex flex-col">
          <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
            {viewState === "loading" ? <MeasurementMobileSkeleton rows={pagination.pageSize} /> : null}
            {viewState === "error" ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center" role="alert">
                <HugeiconsIcon icon={AlertCircleIcon} className="mb-3 size-8 text-destructive/60" aria-hidden="true" />
                <p className="font-medium text-foreground">{t("states.errorTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("states.errorDescription")}</p>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
                  {tCommon("actions.retry")}
                </Button>
              </div>
            ) : null}
            {viewState === "empty" ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center" role="status">
                <HugeiconsIcon icon={Search01Icon} className="mb-2 size-9 text-muted-foreground/30" aria-hidden="true" />
                <p className="font-medium text-foreground">{hasActiveFilters ? t("states.emptyFiltered") : t("states.emptyTitle")}</p>
              </div>
            ) : null}
            {viewState === "ready" ? (
              <ul className="divide-y">
                {data.map((measurement) => (
                  <li key={getMeasurementKey(measurement)}>
                    <MeasurementMobileRow measurement={measurement} locale={locale} t={t} tCommon={tCommon} />
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
        <div className="min-w-full">
          <div className="custom-scrollbar overflow-x-auto overflow-y-hidden">
            <DataTable.Root table={table} className="block rounded-b-none border-b-0">
              <DataTable.Table>
                <caption className="sr-only">{t("table.caption")}</caption>
                <DataTable.Header />
                {viewState === "loading" ? <DataTable.Skeleton rows={pagination.pageSize} columns={columns.length} /> : null}
                {viewState === "error" ? (
                  <tbody>
                    <DataTable.Empty columns={columns.length}>
                      <div className="flex flex-col items-center gap-2" role="alert">
                        <HugeiconsIcon icon={AlertCircleIcon} className="size-8 text-destructive/60" aria-hidden="true" />
                        <p className="font-medium text-foreground">{t("states.errorTitle")}</p>
                        <p className="text-sm text-muted-foreground">{t("states.errorDescription")}</p>
                        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                          {tCommon("actions.retry")}
                        </Button>
                      </div>
                    </DataTable.Empty>
                  </tbody>
                ) : null}
                {viewState === "empty" ? (
                  <tbody>
                    <DataTable.Empty columns={columns.length}>
                      <div className="flex flex-col items-center gap-2" role="status">
                        <HugeiconsIcon icon={Search01Icon} className="size-9 text-muted-foreground/30" aria-hidden="true" />
                        <p className="font-medium text-foreground">{hasActiveFilters ? t("states.emptyFiltered") : t("states.emptyTitle")}</p>
                      </div>
                    </DataTable.Empty>
                  </tbody>
                ) : null}
                {viewState === "ready" ? (
                  <DataTable.Body getRowHref={getMeasurementMapHref} getRowAriaLabel={getRowAriaLabel} rowClassName="group" />
                ) : null}
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
