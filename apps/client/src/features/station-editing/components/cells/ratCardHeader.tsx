import { Note01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type EditText, useEditText } from "../../hooks/useStationDraft";
import { TEXT_SEPARATOR } from "../../model/changes";
import type { RatCounters } from "../../model/types";
import { type CellColumn, GRID_ROW_CLASS } from "./cellGrid";
import type { CellTexts } from "./cellTexts";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CellTypeInfoPopover } from "@/features/shared/CellTypeInfoPopover";
import { cn } from "@/lib/utils";

type CellTone = "added" | "changed" | "deleted";

type ToneDotProps = {
  tone: CellTone;
};

type CounterBadgeProps = {
  tone: CellTone;
  count: number;
  label: string;
};

type RatCounterBadgesProps = {
  counters: RatCounters;
};

type BarButtonProps = {
  label: string;
  icon: IconSvgElement;
  onClick: () => void;
};

type IconActionProps = {
  label: string;
  icon: IconSvgElement;
  variant?: "ghost" | "outline";
  size?: "icon-sm" | "icon";
  isDisabled?: boolean;
  onClick: () => void;
};

type HeadLabelProps = {
  hint: string | null;
  className?: string;
  children: ReactNode;
};

type HeadCellProps = {
  column: CellColumn;
  text: EditText;
};

type CellHeadRowProps = {
  columns: readonly CellColumn[];
  texts: CellTexts;
  tail?: ReactNode;
};

export const BAR_LABEL_CLASS = "hidden @[640px]/cells:inline";

const TONE_TEXT_CLASSES: Record<CellTone, string> = {
  added: "text-emerald-700 dark:text-emerald-400",
  changed: "text-amber-700 dark:text-amber-400",
  deleted: "text-destructive",
};
const TONE_DOT_CLASSES: Record<CellTone, string> = { added: "bg-emerald-500", changed: "bg-amber-500", deleted: "bg-destructive" };
const COMPUTED_MARK = "ƒ";
const HEAD_CLASS = cn(
  GRID_ROW_CLASS,
  "h-[33px] items-center border-b text-xs font-medium whitespace-nowrap text-muted-foreground",
  "bg-[color-mix(in_oklab,var(--muted)_30%,var(--background))]",
);

export function ToneDot({ tone }: ToneDotProps) {
  return <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT_CLASSES[tone])} />;
}

function CounterBadge({ tone, count, label }: CounterBadgeProps) {
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-xs whitespace-nowrap", TONE_TEXT_CLASSES[tone])}>
      <ToneDot tone={tone} />
      {count} {label}
    </span>
  );
}

export function RatCounterBadges({ counters }: RatCounterBadgesProps) {
  const { t } = useTranslation();
  const { added, changed, deleted } = counters;
  if (added === 0 && changed === 0 && deleted === 0) return null;

  return (
    <span className="ml-1 flex min-w-0 items-center gap-2 overflow-hidden">
      {added > 0 ? <CounterBadge tone="added" count={added} label={t("stations:cells.diffAdded", { count: added })} /> : null}
      {changed > 0 ? <CounterBadge tone="changed" count={changed} label={t("stations:cells.diffModified", { count: changed })} /> : null}
      {deleted > 0 ? <CounterBadge tone="deleted" count={deleted} label={t("stations:cells.diffDeleted", { count: deleted })} /> : null}
    </span>
  );
}

export function BarButton({ label, icon, onClick }: BarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger aria-label={label} onClick={onClick} render={<Button type="button" variant="ghost" size="sm" className="cursor-pointer" />}>
        <HugeiconsIcon icon={icon} aria-hidden="true" />
        <span className={BAR_LABEL_CLASS}>{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function IconAction({ label, icon, variant = "ghost", size = "icon", isDisabled = false, onClick }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        onClick={onClick}
        render={<Button type="button" variant={variant} size={size} disabled={isDisabled} className="cursor-pointer" />}
      >
        <HugeiconsIcon icon={icon} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function HeadLabel({ hint, className, children }: HeadLabelProps) {
  if (hint === null) return <span className={cn("truncate", className)}>{children}</span>;

  return (
    <Tooltip>
      <TooltipTrigger render={<span />} className={cn("cursor-help truncate", className)}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function HeadCell({ column, text }: HeadCellProps) {
  const label = text.formatPart(column.label);
  const hint = column.hint === null ? null : text.formatPart(column.hint);

  if (column.kind === "confirmed") {
    return (
      <HeadLabel hint={label} className="flex justify-center">
        <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{label}</span>
      </HeadLabel>
    );
  }
  if (column.kind === "cellType") {
    return (
      <span className="flex min-w-0 items-center gap-0.5">
        <span className="truncate">{label}</span>
        <CellTypeInfoPopover align="end" />
      </span>
    );
  }

  const fullHint = column.kind === "number" ? `${hint}${TEXT_SEPARATOR}0-${column.spec.max}` : hint;
  return (
    <HeadLabel hint={fullHint} className={column.kind === "flag" ? "text-center" : undefined}>
      {label}
      {column.kind === "computed" ? (
        <span aria-hidden="true" className="ml-0.5 font-serif italic">
          {COMPUTED_MARK}
        </span>
      ) : null}
    </HeadLabel>
  );
}

export function CellHeadRow({ columns, texts, tail }: CellHeadRowProps) {
  const { t } = useTranslation();
  const text = useEditText();

  return (
    <div className={HEAD_CLASS}>
      {columns.map((column) => (
        <HeadCell key={column.id} column={column} text={text} />
      ))}
      {tail === undefined ? (
        <div className="@container/tail flex min-w-0 items-center">
          <span className="hidden truncate @[166px]/tail:inline">{t("common:labels.notes")}</span>
          <span title={texts.note} className="flex w-7 justify-center @[166px]/tail:hidden">
            <HugeiconsIcon icon={Note01Icon} aria-hidden="true" className="size-3.5" />
            <span className="sr-only">{texts.note}</span>
          </span>
        </div>
      ) : (
        <div className="flex min-w-0 items-center justify-end gap-1.5 pr-1">{tail}</div>
      )}
    </div>
  );
}
