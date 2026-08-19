import { MapPinIcon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { getStationBands } from "@/features/map/utils";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { getOperatorColor } from "@/lib/operatorUtils";
import type { AppTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";
import type { Station, StationSortBy, StationSortDirection } from "@/types/station";

import { StationStatusBadge } from "./StationStatusBadge";

interface SortableHeaderProps {
  label: string;
  column: StationSortBy;
  sort: StationSortDirection;
  sortBy: StationSortBy | undefined;
  onSort: (column: StationSortBy) => void;
}

function SortableHeader({ label, column, sort, sortBy, onSort }: SortableHeaderProps) {
  const isActive = sortBy === column;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
      onClick={() => onSort(column)}
    >
      {label}
      <HugeiconsIcon
        icon={Sorting05Icon}
        className={cn("size-3.5 transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40")}
        style={isActive && sort === "asc" ? { transform: "scaleY(-1)" } : undefined}
      />
    </button>
  );
}

type CreateColumnsOptions = {
  t: TFunction;
  locale: string;
  sort: StationSortDirection;
  sortBy: StationSortBy | undefined;
  onSort: (column: StationSortBy) => void;
};

export function createStationsColumns({ t, locale, sort, sortBy, onSort }: CreateColumnsOptions): ColumnDef<AppTableFeatures, Station>[] {
  const columns: ColumnDef<AppTableFeatures, Station>[] = [
    {
      accessorKey: "station_id",
      header: () => <SortableHeader label={t("labels.stationId")} column="station_id" sort={sort} sortBy={sortBy} onSort={onSort} />,
      size: 80,
      cell: ({ row: { original: station } }) => (
        <div className="flex flex-col items-start gap-1 pl-2">
          <span className="font-mono text-sm text-muted-foreground">{station.station_id}</span>
          {station.status ? <StationStatusBadge status={station.status} statusChangedAt={station.statusChangedAt} /> : null}
        </div>
      ),
    },
    {
      accessorKey: "operator",
      header: t("labels.operator"),
      size: 160,
      cell: ({ row: { original: s } }) => {
        if (!s.operator) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex items-start gap-2">
            <div className="size-3 rounded-[2px] shrink-0 mt-1" style={{ backgroundColor: getOperatorColor(s.operator.mnc) }} />
            <div className="flex flex-col">
              <span className="font-medium">{s.operator.name}</span>
              {s.operator.full_name !== s.operator.name && (
                <span className="text-xs text-muted-foreground truncate max-w-40">{s.operator.full_name}</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: "technology",
      header: `${t("labels.standard")} / ${t("labels.band")}`,
      size: 220,
      accessorFn: (station) => getStationBands(station.cells),
      cell: ({ getValue }) => <TechnologySummary bands={getValue<string[]>()} className="mt-0 pl-0" />,
    },
    {
      id: "location",
      header: t("labels.location"),
      size: 280,
      accessorFn: (s) => s.location,
      cell: ({ getValue, row }) => {
        const location = getValue<Station["location"]>();
        if (!location) return <span className="text-muted-foreground">-</span>;
        const address = row.original.extra_address || location.address;
        return (
          <div className="flex items-start gap-2 overflow-hidden">
            <HugeiconsIcon icon={MapPinIcon} className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex flex-col min-w-0 overflow-hidden">
              <span className="font-medium truncate">{location.city}</span>
              <span className="text-xs text-muted-foreground truncate">{address}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: "region",
      header: t("labels.region"),
      size: 100,
      accessorFn: (s) => s.location?.region?.name,
      cell: ({ getValue }) => {
        const value = getValue<string | undefined>();
        return <span className="text-muted-foreground">{value || "-"}</span>;
      },
    },
    {
      accessorKey: "updatedAt",
      header: () => <SortableHeader label={t("labels.updated")} column="updatedAt" sort={sort} sortBy={sortBy} onSort={onSort} />,
      size: 140,
      cell: ({ getValue }) => {
        const date = getValue<string>();
        return (
          <Tooltip>
            <TooltipTrigger className="text-muted-foreground cursor-default">{formatRelativeTime(date, t)}</TooltipTrigger>
            <TooltipContent>
              <p>{formatFullDate(date, locale)}</p>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
  ];

  return columns;
}
