import { CheckmarkCircle02Icon, Delete02Icon, Edit01Icon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";

import { PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getOperatorColor } from "@/lib/cellular/operators";
import { formatFullDate, formatRelativeTime, resolveAvatarUrl } from "@/lib/format";
import type { AppTableFeatures } from "@/lib/tableFeatures";

import type { AdminComment } from "../types";

type CreateColumnsOptions = {
  t: TFunction;
  tCommon: TFunction;
  locale: string;
  sortBy: "createdAt" | "id";
  sort: "asc" | "desc";
  onSort: (col: "createdAt" | "id") => void;
  onEdit: (comment: AdminComment) => void;
  onDelete: (comment: AdminComment) => void;
  onApprove: (comment: AdminComment) => void;
  onOpenLightbox: (comment: AdminComment, index: number) => void;
};

export function createCommentsColumns({
  t,
  tCommon,
  locale,
  sortBy,
  sort,
  onSort,
  onEdit,
  onDelete,
  onApprove,
  onOpenLightbox,
}: CreateColumnsOptions): ColumnDef<AppTableFeatures, AdminComment>[] {
  const sortIcon = (col: "createdAt" | "id") => (
    <HugeiconsIcon
      icon={Sorting05Icon}
      className="size-3.5 text-foreground"
      style={sortBy === col && sort === "asc" ? { transform: "scaleY(-1)" } : undefined}
    />
  );

  return [
    {
      accessorKey: "id",
      header: () => (
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
          onClick={() => onSort("id")}
        >
          {t("common:labels.id")}
          {sortIcon("id")}
        </button>
      ),
      size: 80,
      cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground pl-2">{getValue<string>().slice(-8)}</span>,
    },
    {
      id: "author",
      header: t("comments.table.author"),
      size: 180,
      cell: ({ row }) => {
        const author = row.original.author;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="size-7 shrink-0">
              {author?.image && <AvatarImage src={resolveAvatarUrl(author.image)} alt={author.name} />}
              <AvatarFallback className="text-[9px]">{author?.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{author?.name ?? `#${row.original.user_id}`}</p>
              {author?.username && <p className="text-xs text-muted-foreground truncate">@{author.username}</p>}
            </div>
          </div>
        );
      },
    },
    {
      id: "station",
      header: t("comments.table.station"),
      size: 160,
      cell: ({ row }) => {
        const station = row.original.station;
        if (!station) return <span className="text-muted-foreground">-</span>;
        const op = station.operator;
        const color = op?.mnc ? getOperatorColor(op.mnc) : "#00E1FF";
        return (
          <Link to="/admin/stations/$id" params={{ id: String(station.id) }} search={{ uke: undefined }} className="flex items-center gap-2 group">
            <div className="size-3 rounded-[2px] border border-background shrink-0" style={{ backgroundColor: color }} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate group-hover:underline">{op?.name ?? "-"}</p>
              <p className="font-mono text-xs text-muted-foreground truncate">{station.station_id}</p>
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: "content",
      header: t("comments.table.content"),
      size: 300,
      cell: ({ getValue }) => {
        const content = getValue<string>();
        const preview = content.replace(/\s+/g, " ").trim();
        return (
          <Tooltip>
            <TooltipTrigger className="text-left max-w-full overflow-hidden whitespace-normal">
              <p className="text-sm line-clamp-2 max-h-10">{preview}</p>
            </TooltipTrigger>
            {(content.length > 100 || content.includes("\n")) && (
              <TooltipContent side="bottom" className="max-w-sm">
                <p className="text-xs whitespace-pre-wrap">{content}</p>
              </TooltipContent>
            )}
          </Tooltip>
        );
      },
    },
    {
      id: "attachments",
      header: t("comments.table.attachments"),
      size: 140,
      cell: ({ row }) => {
        const attachments = row.original.attachments ?? [];
        if (attachments.length === 0) return <span className="text-muted-foreground text-xs">-</span>;
        return (
          <div className="flex items-center gap-1 flex-wrap">
            {attachments.map((att, i) => (
              <button
                key={att.uuid}
                type="button"
                className="size-10 rounded overflow-hidden border bg-muted hover:opacity-80 transition-opacity shrink-0"
                aria-label={tCommon("actions.openPhoto")}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLightbox(row.original, i);
                }}
              >
                <PhotoWithFallback
                  src={`/uploads/${att.uuid}.webp`}
                  alt=""
                  className="size-full object-cover"
                  fallbackClassName="[&_svg]:size-4"
                  fallbackLabelClassName="sr-only"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: tCommon("labels.status"),
      size: 100,
      cell: ({ getValue }) => {
        const status = getValue<AdminComment["status"]>();
        return <Badge variant={status === "pending" ? "outline" : "secondary"}>{status}</Badge>;
      },
    },
    {
      accessorKey: "createdAt",
      header: () => (
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
          onClick={() => onSort("createdAt")}
        >
          {tCommon("labels.created")}
          {sortIcon("createdAt")}
        </button>
      ),
      size: 120,
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
    {
      id: "actions",
      size: 110,
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end pr-2">
          {row.original.status === "pending" && (
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0 text-muted-foreground hover:text-green-500"
              onClick={(e) => {
                e.stopPropagation();
                onApprove(row.original);
              }}
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(row.original);
            }}
          >
            <HugeiconsIcon icon={Edit01Icon} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row.original);
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </Button>
        </div>
      ),
    },
  ];
}
