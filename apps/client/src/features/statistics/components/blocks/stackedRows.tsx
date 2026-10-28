import { type CSSProperties, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OperatorCount, StackedRow } from "../../lib/chartData";
import { toPercent } from "../../lib/format";
import { listOperators } from "../../lib/operators";
import { BlockHeader, EmptyBlock } from "../card/statisticsCard";
import { OperatorLegend } from "./operatorLegend";
import { type BreakdownHandles, BreakdownPopup, BreakdownTrigger, createBreakdownHandles } from "./rowBreakdown";
import { BrandMark } from "@/components/cellular/brandMark";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBandMhzLabel } from "@/features/station-details/station/utils/bands";
import { useIsCoarsePointer } from "@/hooks/useCoarsePointer";
import { cn } from "@/lib/utils";

type RowGroup = { key: string; title: string | null; rows: StackedRow[] };
type LabelWidth = "band" | "region";
type StackedRowsProps = {
  title: string;
  description?: string;
  note?: ReactNode;
  legend?: ReactNode;
  rows: readonly StackedRow[];
  labelWidth: LabelWidth;
  fillsWidth?: boolean;
};

const ROW_TRIGGER_CLASS =
  "-mx-2 grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-md px-2 pt-1.5 pb-2 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted/50 @md:py-0";
const ROW_GRID_CLASSES: Record<LabelWidth, string> = {
  band: "@md:grid-cols-[6rem_minmax(0,1fr)_4rem]",
  region: "@md:grid-cols-[11rem_minmax(0,1fr)_4rem]",
};
const SKELETON_BAR_WIDTHS = ["w-[92%]", "w-[74%]", "w-full", "w-[58%]", "w-[81%]", "w-[43%]", "w-[66%]"];
const FULL_WIDTH = 100;

export function toFillStyle(color: string, isHatched: boolean): CSSProperties {
  if (!isHatched) return { backgroundColor: color };
  return { backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 5px)`, boxShadow: `inset 0 0 0 1px ${color}` };
}

function toSegmentStyle({ operator, value }: OperatorCount, isHatched: boolean): CSSProperties {
  return { flex: `${value} 1 0px`, ...toFillStyle(operator.color, isHatched) };
}

function splitByGroup(rows: readonly StackedRow[]): RowGroup[] {
  const groups: RowGroup[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last !== undefined && last.title === row.group) last.rows.push(row);
    else groups.push({ key: row.key, title: row.group, rows: [row] });
  }
  return groups;
}

function RowLabel({ row }: { row: StackedRow }) {
  const { i18n } = useTranslation();

  if (row.operator !== undefined) {
    return (
      <>
        <BrandMark brand={row.operator.brand} />
        <span className="truncate">{row.name}</span>
      </>
    );
  }
  if (row.mhz === null) {
    return <span className={cn("truncate", row.isMono && "font-mono", row.isUnknown && "text-muted-foreground")}>{row.name}</span>;
  }
  return (
    <>
      <span className="truncate font-mono">{formatBandMhzLabel(row.mhz, i18n.language)}</span>
      {row.code === null ? null : <span className="font-mono text-[11px] text-muted-foreground">{row.code}</span>}
    </>
  );
}

type StackedRowItemProps = { row: StackedRow; width: number; labelWidth: LabelWidth; handles: BreakdownHandles; isCoarsePointer: boolean };

function StackedRowItem({ row, width, labelWidth, handles, isCoarsePointer }: StackedRowItemProps) {
  const { i18n } = useTranslation();
  const breakdown = row.parts.map((part) => `${part.operator.name} ${part.value.toLocaleString(i18n.language)}`).join(", ");

  return (
    <li className={cn(row.isUnknown && "not-first:mt-3")}>
      <BreakdownTrigger row={row} handles={handles} isCoarsePointer={isCoarsePointer} className={cn(ROW_TRIGGER_CLASS, ROW_GRID_CLASSES[labelWidth])}>
        <span className={cn("flex min-w-0 gap-1.5 text-[0.8125rem] leading-5", row.operator === undefined ? "items-baseline" : "items-center")}>
          <RowLabel row={row} />
          <span className="sr-only">{breakdown}</span>
        </span>
        <span className="order-last col-span-2 flex h-3 min-w-0 items-center @md:order-none @md:col-span-1">
          <span className="flex h-3 gap-0.5" style={{ width: `${width}%` }}>
            {row.parts.map((part) => (
              <span
                key={part.operator.id}
                style={toSegmentStyle(part, row.isUnknown === true || part.isUnknown === true)}
                className="min-w-0.5 rounded-[3px]"
              />
            ))}
          </span>
        </span>
        <span className="text-right text-[0.8125rem] leading-5 font-semibold whitespace-nowrap tabular-nums">
          {row.total.toLocaleString(i18n.language)}
        </span>
      </BreakdownTrigger>
    </li>
  );
}

export function StackedRows({ title, description, note, legend, rows, labelWidth, fillsWidth = false }: StackedRowsProps) {
  const maxTotal = Math.max(0, ...rows.map((row) => row.total));
  const isCoarsePointer = useIsCoarsePointer();
  const [handles] = useState(createBreakdownHandles);

  return (
    <div className="@container">
      <BlockHeader title={title} description={description} note={note} />
      {rows.length === 0 ? (
        <EmptyBlock />
      ) : (
        <>
          <div className="mt-2">
            {legend ?? <OperatorLegend operators={listOperators(rows.flatMap((row) => row.parts.map((part) => part.operator)))} />}
          </div>
          <div className="mt-2">
            {splitByGroup(rows).map((group) => (
              <div key={group.key} className="not-first:mt-3">
                {group.title === null ? null : (
                  <p className="pt-0.5 pb-1 text-[11px] leading-3.5 font-bold tracking-[0.06em] text-muted-foreground">{group.title}</p>
                )}
                <ul aria-label={group.title ?? title}>
                  {group.rows.map((row) => (
                    <StackedRowItem
                      key={row.key}
                      row={row}
                      width={fillsWidth ? FULL_WIDTH : toPercent(row.total, maxTotal)}
                      labelWidth={labelWidth}
                      handles={handles}
                      isCoarsePointer={isCoarsePointer}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <BreakdownPopup handles={handles} isCoarsePointer={isCoarsePointer} />
        </>
      )}
    </div>
  );
}

export function StackedRowsSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-3.5 w-30" />
      <div className="mt-4 flex flex-col gap-3">
        {SKELETON_BAR_WIDTHS.map((width) => (
          <div key={width} className="flex items-center gap-3">
            <Skeleton className="h-3 w-18 shrink-0" />
            <span className="min-w-0 flex-1">
              <Skeleton className={cn("h-3 rounded-[3px]", width)} />
            </span>
            <Skeleton className="h-3 w-11 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
