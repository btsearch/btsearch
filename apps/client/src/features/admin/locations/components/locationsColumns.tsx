import { AirportTowerIcon, MapPinIcon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { getOperatorColor } from "@/lib/operatorUtils";
import type { AppTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";
import type { LocationSortBy, LocationSortDirection, LocationWithStations } from "@/types/station";

interface SortableHeaderProps {
  label: string;
  column: LocationSortBy;
  sort: LocationSortDirection;
  sortBy: LocationSortBy | undefined;
  onSort: (column: LocationSortBy) => void;
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
  tCommon: TFunction;
  locale: string;
  sort: LocationSortDirection;
  sortBy: LocationSortBy | undefined;
  onSort: (column: LocationSortBy) => void;
};

export function createLocationsColumns({
  t,
  tCommon,
  locale,
  sort,
  sortBy,
  onSort,
}: CreateColumnsOptions): ColumnDef<AppTableFeatures, LocationWithStations>[] {
  return [
    {
      accessorKey: "id",
      header: () => <SortableHeader label={t("common:labels.id")} column="id" sort={sort} sortBy={sortBy} onSort={onSort} />,
      size: 70,
      cell: ({ getValue }) => <span className="font-mono text-sm text-muted-foreground pl-2">{getValue<number>()}</span>,
    },
    {
      accessorKey: "city",
      header: t("common:labels.city"),
      size: 180,
      cell: ({ getValue }) => {
        const city = getValue<string>();
        return city ? (
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={MapPinIcon} className="size-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{city}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: "address",
      header: t("common:labels.address"),
      size: 240,
      cell: ({ getValue }) => {
        const address = getValue<string>();
        return address ? (
          <span className="text-sm text-muted-foreground truncate block">{address}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      id: "region",
      header: t("common:labels.region"),
      size: 120,
      accessorFn: (row) => row.region?.name,
      cell: ({ getValue }) => {
        const name = getValue<string | undefined>();
        return <span className="text-muted-foreground">{name || "-"}</span>;
      },
    },
    {
      id: "coordinates",
      header: t("common:labels.coordinates"),
      size: 180,
      cell: ({ row }) => {
        const loc = row.original;
        return (
          <span className="font-mono text-xs text-muted-foreground">
            {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
          </span>
        );
      },
    },
    {
      id: "stations",
      header: t("common:labels.stations"),
      size: 140,
      accessorFn: (row) => row.stations?.length ?? 0,
      cell: ({ row }) => {
        const stations = row.original.stations ?? [];
        if (stations.length === 0) return <span className="text-muted-foreground">-</span>;

        const uniqueOperators = [...new Map(stations.filter((s) => s.operator).map((s) => [s.operator_id, s.operator])).values()];

        return (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <HugeiconsIcon icon={AirportTowerIcon} className="size-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">{stations.length}</span>
            </div>
            <div className="flex items-center gap-0.5">
              {uniqueOperators.map((op) => (
                <Tooltip key={op.id}>
                  <TooltipTrigger>
                    <div className="size-3 rounded-[2px] border border-background" style={{ backgroundColor: getOperatorColor(op.mnc) }} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{op.name}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "updatedAt",
      header: () => <SortableHeader label={t("common:labels.updated")} column="updatedAt" sort={sort} sortBy={sortBy} onSort={onSort} />,
      size: 130,
      cell: ({ getValue }) => {
        const date = getValue<string>();
        return (
          <Tooltip>
            <TooltipTrigger className="text-muted-foreground cursor-default">{formatRelativeTime(date, tCommon)}</TooltipTrigger>
            <TooltipContent>
              <p>{formatFullDate(date, locale)}</p>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
  ];
}
