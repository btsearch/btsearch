import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { StackedRow } from "../../lib/chartData";
import { toPercent } from "../../lib/format";
import { listOperators } from "../../lib/operators";
import { BlockHeader, EmptyBlock } from "../card/statisticsCard";
import { OperatorLegend } from "./operatorLegend";
import { type BreakdownHandles, BreakdownPopup, BreakdownTrigger, createBreakdownHandles } from "./rowBreakdown";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBandMhzLabel } from "@/features/station-details/station/utils/bands";
import { useIsCoarsePointer } from "@/hooks/useCoarsePointer";
import { cn } from "@/lib/utils";

type RowGroup = { key: string; title: string | null; rows: StackedRow[] };
type LabelWidth = "band" | "region";

const ROW_TRIGGER_CLASS =
  "-mx-2 grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-md px-2 pt-1.5 pb-2 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted/50 @md:py-0";
const ROW_GRID_CLASSES: Record<LabelWidth, string> = {
  band: "@md:grid-cols-[6rem_minmax(0,1fr)_4rem]",
  region: "@md:grid-cols-[11rem_minmax(0,1fr)_4rem]",
};
const SKELETON_BAR_WIDTHS = ["w-[92%]", "w-[74%]", "w-full", "w-[58%]", "w-[81%]", "w-[43%]", "w-[66%]"];

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

  if (row.mhz === null) return <span className="truncate">{row.name}</span>;
  return (
    <>
      <span className="truncate font-mono">{formatBandMhzLabel(row.mhz, i18n.language)}</span>
      {row.code === null ? null : <span className="font-mono text-[11px] text-muted-foreground">{row.code}</span>}
    </>
  );
}

type StackedRowItemProps = { row: StackedRow; maxTotal: number; labelWidth: LabelWidth; handles: BreakdownHandles; isCoarsePointer: boolean };

function StackedRowItem({ row, maxTotal, labelWidth, handles, isCoarsePointer }: StackedRowItemProps) {
  const { i18n } = useTranslation();
  const width = toPercent(row.total, maxTotal);
  const breakdown = row.parts.map((part) => `${part.operator.name} ${part.value.toLocaleString(i18n.language)}`).join(", ");

  return (
    <li>
      <BreakdownTrigger row={row} handles={handles} isCoarsePointer={isCoarsePointer} className={cn(ROW_TRIGGER_CLASS, ROW_GRID_CLASSES[labelWidth])}>
        <span className="flex min-w-0 items-baseline gap-1.5 text-[0.8125rem] leading-5">
          <RowLabel row={row} />
          <span className="sr-only">{breakdown}</span>
        </span>
        <span className="order-last col-span-2 flex h-3 min-w-0 items-center @md:order-none @md:col-span-1">
          <span className="flex h-3 gap-0.5" style={{ width: `${width}%` }}>
            {row.parts.map((part) => (
              <span
                key={part.operator.id}
                style={{ flex: `${part.value} 1 0px`, backgroundColor: part.operator.color }}
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

export function StackedRows({ title, rows, labelWidth }: { title: string; rows: readonly StackedRow[]; labelWidth: LabelWidth }) {
  const maxTotal = Math.max(0, ...rows.map((row) => row.total));
  const operators = listOperators(rows.flatMap((row) => row.parts.map((part) => part.operator)));
  const isCoarsePointer = useIsCoarsePointer();
  const [handles] = useState(createBreakdownHandles);

  return (
    <div className="@container">
      <BlockHeader title={title} />
      {rows.length === 0 ? (
        <EmptyBlock />
      ) : (
        <>
          <div className="mt-2">
            <OperatorLegend operators={operators} />
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
                      maxTotal={maxTotal}
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
