import { FileAttachmentIcon, MapPinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getPermitBands } from "@/features/map/utils";
import { getOperatorColor } from "@/lib/operatorUtils";
import type { AppTableFeatures } from "@/lib/tableFeatures";
import type { UkeStation } from "@/types/station";

type CreateColumnsOptions = {
  t: TFunction;
  tCommon: TFunction;
};

export function createUnassignedPermitsColumns({ t, tCommon }: CreateColumnsOptions): ColumnDef<AppTableFeatures, UkeStation>[] {
  return [
    {
      accessorKey: "station_id",
      header: tCommon("labels.stationId"),
      size: 140,
      cell: ({ getValue }) => {
        return <span className="font-mono text-sm text-muted-foreground pl-2">{getValue<string>()}</span>;
      },
    },
    {
      id: "operator",
      header: tCommon("labels.operator"),
      size: 150,
      accessorFn: (row) => row.operator?.name,
      cell: ({ row }) => {
        const op = row.original.operator;
        if (!op) return <span className="text-muted-foreground">-</span>;
        const color = op.mnc ? getOperatorColor(op.mnc) : undefined;
        return (
          <div className="flex items-center gap-2">
            {color && <div className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: color }} />}
            <span className="text-sm font-medium truncate">{op.name}</span>
          </div>
        );
      },
    },
    {
      id: "city",
      header: tCommon("labels.city"),
      size: 160,
      accessorFn: (row) => row.location?.city,
      cell: ({ row }) => {
        const city = row.original.location?.city;
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
      id: "address",
      header: tCommon("labels.address"),
      size: 220,
      accessorFn: (row) => row.location?.address,
      cell: ({ row }) => {
        const address = row.original.location?.address;
        return address ? (
          <span className="text-sm text-muted-foreground truncate block">{address}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      id: "region",
      header: tCommon("labels.region"),
      size: 120,
      accessorFn: (row) => row.location?.region?.name,
      cell: ({ getValue }) => {
        const name = getValue<string | undefined>();
        return <span className="text-muted-foreground">{name || "-"}</span>;
      },
    },
    {
      id: "permits",
      header: t("admin:ukePermits.permits"),
      size: 140,
      accessorFn: (row) => row.permits?.length ?? 0,
      cell: ({ row }) => {
        const station = row.original;
        const permits = station.permits ?? [];
        if (permits.length === 0) return <span className="text-muted-foreground">-</span>;

        const bands = getPermitBands(permits);

        return (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <HugeiconsIcon icon={FileAttachmentIcon} className="size-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">{permits.length}</span>
            </div>
            {bands.length > 0 && (
              <Tooltip>
                <TooltipTrigger>
                  <span className="text-xs text-muted-foreground truncate max-w-20">{bands.slice(0, 3).join(", ")}</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{bands.join(", ")}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];
}
