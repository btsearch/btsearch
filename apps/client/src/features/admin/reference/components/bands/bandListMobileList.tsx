import { Delete02Icon, MoreHorizontalCircle01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { Band } from "../../types";
import { getGenerationRat } from "../../utils/bands";
import type { Loadable } from "../shared/loadable";
import { RecordListMobileList, type RecordListStateProps } from "../shared/recordListPrimitives";
import { ReferenceMeta, ReferenceMetaItem } from "../shared/referenceCards";
import { describeBandRanges } from "./bandCatalog";
import { BandCodeChip } from "./bandListCells";
import { useBandListActions } from "./bandListColumns";
import type { BandListRow } from "./useBandListRows";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { cn } from "@/lib/utils";

type BandListMobileListProps = RecordListStateProps & {
  rows: BandListRow[];
};

const SKELETON_ROW_COUNT = 8;
const MENU_BUTTON_CLASS = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "cursor-pointer text-muted-foreground");

function BandMobileRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-6 shrink-0 rounded-sm" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-3 w-44 max-w-full" />
      </div>
      <Skeleton className="h-4 w-16 shrink-0" />
    </div>
  );
}

function BandMobileRanges({ band }: { band: Band }) {
  const { t } = useTranslation("admin");
  const ranges = describeBandRanges(band.downlinkKhz, band.uplinkKhz);

  if (ranges.length === 0) return t("admin:reference.bands.code.none");

  return (
    <ReferenceMeta>
      {ranges.map((range, index) => (
        <ReferenceMetaItem key={range}>{index === ranges.length - 1 ? `${range} MHz` : range}</ReferenceMetaItem>
      ))}
    </ReferenceMeta>
  );
}

function BandMobileCellCount({ detail }: { detail: Loadable<number> }) {
  const { t, i18n } = useTranslation("admin");

  if (detail.state === "loading") return <Skeleton aria-hidden="true" className="h-4 w-16 shrink-0" />;
  if (detail.state === "failed") return null;

  return (
    <span className="shrink-0 text-xs leading-4 whitespace-nowrap text-muted-foreground">
      <span className={cn("tabular-nums", detail.value > 0 && "text-foreground")}>{detail.value.toLocaleString(i18n.language)}</span>{" "}
      {t("admin:reference.bands.cellsNoun", { count: detail.value })}
    </span>
  );
}

function BandRowMenu({ band }: { band: Band }) {
  const { t } = useTranslation(["admin", "common"]);
  const { onEdit, onDelete } = useBandListActions();
  const label = t("admin:reference.bands.actions.menu", { name: band.name });

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger aria-label={label} className={MENU_BUTTON_CLASS} />}>
          <HugeiconsIcon icon={MoreHorizontalCircle01Icon} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-auto min-w-36">
        <DropdownMenuItem className="cursor-pointer" onClick={() => onEdit(band)}>
          <HugeiconsIcon icon={PencilEdit02Icon} aria-hidden="true" />
          {t("common:actions.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className="cursor-pointer" onClick={() => onDelete(band)}>
          <HugeiconsIcon icon={Delete02Icon} aria-hidden="true" />
          {t("common:actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BandMobileRow({ row }: { row: BandListRow }) {
  const { band } = row;

  return (
    <div className="flex items-center gap-3 py-2.5 pr-1 pl-3">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-sm leading-5 font-medium">
          <RatGenerationLabel rat={getGenerationRat(band.rat)} />
          <span className="truncate">{band.name}</span>
          {band.code === null ? null : <BandCodeChip code={band.code} />}
        </div>
        <div className="mt-0.5 font-mono text-xs leading-4 text-muted-foreground tabular-nums">
          <BandMobileRanges band={band} />
        </div>
      </div>
      <BandMobileCellCount detail={row.cellCount} />
      <BandRowMenu band={band} />
    </div>
  );
}

export function BandListMobileList({ rows, viewState, emptyState, isRetrying, onRetry }: BandListMobileListProps) {
  return (
    <RecordListMobileList
      skeletonRow={<BandMobileRowSkeleton />}
      skeletonRowCount={SKELETON_ROW_COUNT}
      viewState={viewState}
      emptyState={emptyState}
      isRetrying={isRetrying}
      onRetry={onRetry}
    >
      {rows.map((row) => (
        <li key={row.band.id}>
          <BandMobileRow row={row} />
        </li>
      ))}
    </RecordListMobileList>
  );
}
