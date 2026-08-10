import { MapsIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getOperatorColor } from "@openbts/shared/operatorUtils";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import type { PaginationState } from "@/hooks/useTablePageSize";
import { formatShortDate } from "@/lib/format";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";

import type { PlannedPEMStation } from "../api";

type Props = {
  data: PlannedPEMStation[];
  status: PlannedPEMStation["status"];
  isLoading: boolean;
  totalItems: number;
  pagination: PaginationState;
  onPaginationChange: (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => void;
  pageSizeOptions: number[];
  t: TFunction;
  tCommon: TFunction;
  locale: string;
};

const STATUS_CLASSES: Record<string, string> = {
  PLANNED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  CANCELED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  INACTIVE: "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
};

export function MeasurementsDataTable({
  data,
  status,
  isLoading,
  totalItems,
  pagination,
  onPaginationChange,
  pageSizeOptions,
  t,
  tCommon,
  locale,
}: Props) {
  const columns = useMemo<ColumnDef<AppTableFeatures, PlannedPEMStation>[]>(() => {
    const measurementDateColumns: ColumnDef<AppTableFeatures, PlannedPEMStation>[] =
      status === "INACTIVE"
        ? [
            {
              accessorKey: "disabled_date",
              header: t("table.disabledDate"),
              size: 140,
              cell: ({ getValue }) => {
                const date = getValue<string | null>();
                return <p className="text-muted-foreground tabular-nums text-sm">{date ? formatShortDate(date, locale) : "-"}</p>;
              },
            },
          ]
        : [
            {
              accessorKey: "date.from",
              header: t("table.dateFrom"),
              size: 140,
              cell: ({ getValue }) => {
                const date = getValue<string | null>();
                return <p className="text-muted-foreground tabular-nums text-sm">{date ? formatShortDate(date, locale) : "-"}</p>;
              },
            },
            {
              accessorKey: "date.to",
              header: t("table.dateTo"),
              size: 140,
              cell: ({ getValue }) => {
                const date = getValue<string | null>();
                return <p className="text-muted-foreground tabular-nums text-sm">{date ? formatShortDate(date, locale) : "-"}</p>;
              },
            },
            {
              accessorKey: "lab.name",
              header: t("table.lab"),
              size: 150,
              cell: ({ getValue }) => <span className="block truncate text-sm text-muted-foreground">{getValue<string | null>() ?? "-"}</span>,
            },
          ];

    return [
      {
        accessorKey: "station_id",
        header: tCommon("labels.stationId"),
        size: 80,
        cell: ({ getValue }) => <span className="font-mono text-sm text-muted-foreground pl-2">{getValue<string | null>() ?? "-"}</span>,
      },
      {
        accessorKey: "operator",
        header: tCommon("labels.operator"),
        size: 160,
        cell: ({
          row: {
            original: { operator: op },
          },
        }) => {
          if (!op) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex min-w-0 items-start gap-2">
              <div className="size-3 rounded-[2px] shrink-0 mt-1" style={{ backgroundColor: getOperatorColor(op.mnc) }} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{op.name}</span>
                {op.full_name !== op.name && <span className="max-w-40 truncate text-xs text-muted-foreground">{op.full_name}</span>}
              </div>
            </div>
          );
        },
      },
      ...measurementDateColumns,
      {
        accessorKey: "location",
        header: tCommon("labels.location"),
        size: 140,
        cell: ({
          row: {
            original: { location, region },
          },
        }) => {
          const city = location.city;
          const address = location.address;
          const regionName = region?.name ?? null;
          return (
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium leading-tight">
                <span>{city || "Unknown"}</span>
                {regionName && <span className="ml-1 text-[10px] font-normal text-muted-foreground">· {regionName}</span>}
              </h3>
              {address && <p className="truncate text-[11px] text-muted-foreground">{address}</p>}
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: tCommon("labels.status"),
        size: 90,
        cell: ({ getValue }) => {
          const value = getValue<string>();
          return (
            <Badge variant="outline" className={`${STATUS_CLASSES[value]} whitespace-nowrap`}>
              {t(`status.${value.toLowerCase() as "planned" | "completed" | "canceled" | "inactive"}`)}
            </Badge>
          );
        },
      },
      {
        id: "map",
        size: 112,
        cell: ({
          row: {
            original: { location },
          },
        }) => (
          <a
            href={`/#map=16.00/${location.latitude.toFixed(6)}/${location.longitude.toFixed(6)}~fp`}
            aria-label={tCommon("actions.showOnMap")}
            title={tCommon("actions.showOnMap")}
            className="inline-flex size-8 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs"
          >
            <HugeiconsIcon icon={MapsIcon} className="size-3.5 shrink-0" />
            <span className="hidden whitespace-nowrap sm:inline">{tCommon("actions.showOnMap")}</span>
          </a>
        ),
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

  return (
    <DataTable.Root table={table}>
      <DataTable.Table>
        <DataTable.Header />
        {isLoading ? <DataTable.Skeleton rows={pagination.pageSize} columns={columns.length} /> : <DataTable.Body />}
        <DataTable.Footer columns={columns.length}>
          <DataTablePagination table={table} totalItems={totalItems} pageSizeOptions={pageSizeOptions} />
        </DataTable.Footer>
      </DataTable.Table>
    </DataTable.Root>
  );
}
