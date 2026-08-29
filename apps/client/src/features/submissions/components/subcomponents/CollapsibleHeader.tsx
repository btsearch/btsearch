import { Add01Icon, ArrowDown01Icon, Copy01Icon, FlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { cn } from "@/lib/utils";

import type { RatType } from "../../types";

type DiffCounts = {
  added: number;
  modified: number;
  deleted: number;
};

type CollapsibleHeaderProps = {
  rat: RatType;
  cellsCount: number;
  diffCounts: DiffCounts;
  onAddCell: () => void;
  onAddRemainingCells?: () => void;
  onFillEARFCN?: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

function DiffBadge({ count, color, label }: { count: number; color: string; label: string }) {
  if (count <= 0) return null;

  return (
    <span className={cn("text-xs flex items-center gap-1", `text-${color}-600`)}>
      <span className={cn("size-1.5 rounded-full", `bg-${color}-500`)} />
      {count}
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export function CollapsibleHeader({ rat, cellsCount, diffCounts, onAddCell, onAddRemainingCells, onFillEARFCN, t }: CollapsibleHeaderProps) {
  return (
    <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
      <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer select-none group">
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground group-data-panel-open:rotate-0 -rotate-90" />
        <RatGenerationLabel rat={rat} />
        <span className="font-semibold text-sm">{rat}</span>
        <span className="text-xs text-muted-foreground inline sm:hidden">({cellsCount})</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">({t("stations:cells.cellsCount", { count: cellsCount })})</span>
        <DiffBadge count={diffCounts.added} color="green" label={t("stations:cells.diffAdded", { count: diffCounts.added })} />
        <DiffBadge count={diffCounts.modified} color="amber" label={t("stations:cells.diffModified", { count: diffCounts.modified })} />
        <DiffBadge count={diffCounts.deleted} color="red" label={t("stations:cells.diffDeleted", { count: diffCounts.deleted })} />
      </CollapsibleTrigger>
      <div className="flex items-center gap-1">
        {onFillEARFCN && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onFillEARFCN}
            className="h-7 text-xs text-sky-600/80 hover:text-sky-600 hover:bg-sky-500/10 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-sky-400/10"
          >
            <HugeiconsIcon icon={FlashIcon} className="size-3.5" />
            <span className="hidden sm:inline">{t("stations:cells.fillEarfcn")}</span>
          </Button>
        )}
        {onAddRemainingCells && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddRemainingCells}
            className="h-7 text-xs text-purple-600/80 hover:text-purple-600 hover:bg-purple-500/10 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-400/10"
          >
            <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
            <span className="hidden sm:inline">{t("stations:cells.addRemainingCells")}</span>
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onAddCell} className="h-7 text-xs">
          <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          <span className="hidden sm:inline">{t("stations:cells.addCell")}</span>
        </Button>
      </div>
    </div>
  );
}
