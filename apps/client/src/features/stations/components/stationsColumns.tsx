import { MapPinIcon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { memo } from "react";

import { RatBadge } from "@/components/rat-badge";
import type { Rat } from "@/components/rat-badge";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RAT_ORDER } from "@/features/map/constants";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { getOperatorColor } from "@/lib/operatorUtils";
import type { AppTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";
import type { Station, StationSortBy, StationSortDirection } from "@/types/station";

const BandBadge = memo(({ band }: { band: string }) => (
  <Badge variant="secondary" className="text-xs font-mono px-1.5 py-0">
    {band}
  </Badge>
));

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
  isSearchActive?: boolean;
  sort: StationSortDirection;
  sortBy: StationSortBy | undefined;
  onSort: (column: StationSortBy) => void;
};

export function createStationsColumns({
  t,
  locale,
  isSearchActive = false,
  sort,
  sortBy,
  onSort,
}: CreateColumnsOptions): ColumnDef<AppTableFeatures, Station>[] {
  const columns: ColumnDef<AppTableFeatures, Station>[] = [
    {
      accessorKey: "station_id",
      header: () => <SortableHeader label={t("labels.stationId")} column="station_id" sort={sort} sortBy={sortBy} onSort={onSort} />,
      size: 80,
      cell: ({ getValue }) => <span className="font-mono text-sm text-muted-foreground pl-2">{getValue<string>()}</span>,
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
      id: "standards",
      header: t("labels.standard"),
      size: 140,
      accessorFn: (station) => {
        if (!station.cells) return [];
        const rats = new Set(station.cells.filter((c) => c.rat).map((c) => c.rat.toUpperCase()));
        return RAT_ORDER.filter((rat) => rats.has(rat));
      },
      cell: ({ getValue }) => (
        <div className="flex items-center gap-1 flex-wrap">
          {getValue<Rat[]>().map((rat) => (
            <RatBadge key={rat} rat={rat} />
          ))}
        </div>
      ),
    },
    ...(isSearchActive
      ? []
      : ([
          {
            id: "bands" as const,
            header: t("labels.band"),
            size: 160,
            accessorFn: (station: Station) => {
              if (!station.cells) return [];
              const bands = new Set(station.cells.filter((c) => c.band?.value).map((c) => `${c.band.value}`));
              return Array.from(bands).sort((a, b) => Number(a) - Number(b));
            },
            cell: ({ getValue }) => {
              const bands = getValue<string[]>();
              if (bands.length === 0) return <span className="text-muted-foreground">-</span>;
              const displayBands = bands.slice(0, 4);
              const hiddenBands = bands.slice(4);
              return (
                <div className="flex items-center gap-1 flex-wrap">
                  {displayBands.map((band) => (
                    <BandBadge key={band} band={band} />
                  ))}
                  {hiddenBands.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger className="text-xs text-muted-foreground cursor-default">+{hiddenBands.length}</TooltipTrigger>
                      <TooltipContent>
                        <p>{hiddenBands.join(", ")}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            },
          },
        ] as ColumnDef<AppTableFeatures, Station>[])),
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
