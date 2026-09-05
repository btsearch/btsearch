import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { getNsgCellOperator } from "@/lib/nsg/operator";
import { type NsgSnapshot, getPrimaryNsgCell } from "@/lib/nsg/snapshots";
import type { NsgCell } from "@/lib/nsg/types";
import { cn } from "@/lib/utils";

import { formatCellIdentity, getCellIdentityFields, getCellMeasurementFields, getDisplayRat } from "./cellPresentation";
import { formatTime, formatValue } from "./display";
import { OperatorName } from "./operatorName";

export function CellDetails({ cell }: { cell: NsgCell }) {
  const { t } = useTranslation("nsg");
  const operator = getNsgCellOperator(cell);
  const identityFields = getCellIdentityFields(cell);
  const measurementFields = getCellMeasurementFields(cell);

  return (
    <div className="space-y-3 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <RatGenerationLabel rat={getDisplayRat(cell.rat)} />
        <span className="font-semibold">{cell.rat}</span>
        <OperatorName operator={operator} labelClassName="text-sm" />
        <span className="ml-auto text-muted-foreground">
          {t("labels.slot")} {formatValue(cell.slotId)} / {formatValue(cell.subId)}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
        {identityFields.map(({ key, label, value }) => (
          <div key={key}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-mono text-sm font-semibold tabular-nums">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 border-t pt-3 @min-[1000px]:grid-cols-5 @min-[1000px]:gap-x-3">
        {measurementFields.map(({ key, label, value, unit }) => (
          <div key={key}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-mono text-sm font-semibold tabular-nums">
              {formatValue(value)} {unit ? <span className="text-[11px] font-normal text-muted-foreground">{unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MeasurementHistory({
  snapshots,
  selectedIndex,
  onSelect,
}: {
  snapshots: readonly NsgSnapshot[];
  selectedIndex: number;
  onSelect: (eventIndex: number) => void;
}) {
  const { t } = useTranslation("nsg");
  const scrollRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual requires the compiler's automatic bailout
  const virtualizer = useVirtualizer({
    count: snapshots.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 74,
    getItemKey: (index) => snapshots[index].eventIndex,
    overscan: 6,
    useFlushSync: false,
  });

  useEffect(() => {
    if (snapshots.length > 0) virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
  }, [selectedIndex, snapshots.length, virtualizer]);

  return (
    <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={t("history.title")}>
      {snapshots.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("history.empty")}</p>
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const snapshot = snapshots[item.index];
            const cell = getPrimaryNsgCell(snapshot.cells);
            if (!cell) return null;
            return (
              <div
                key={snapshot.eventIndex}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <button
                  type="button"
                  aria-pressed={item.index === selectedIndex}
                  onClick={() => onSelect(snapshot.eventIndex)}
                  title={formatTime(snapshot.timestampMs, true)}
                  className={cn(
                    "w-full border-b px-4 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    item.index === selectedIndex && "bg-primary/5",
                  )}
                >
                  <span className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-semibold tabular-nums">{formatTime(snapshot.timestampMs)}</span>
                    <RatGenerationLabel rat={getDisplayRat(cell.rat)} />
                    <span className="text-muted-foreground">{cell.rat}</span>
                    <span className="ml-auto font-mono font-medium">{formatValue(cell.dbm ?? cell.rsrp)} dBm</span>
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">{formatCellIdentity(cell)}</span>
                  <span className="mt-0.5 flex gap-2 text-[10px] text-muted-foreground">
                    <span>
                      {t("labels.slot")} {formatValue(cell.slotId)} / {formatValue(cell.subId)}
                    </span>
                    <span className="ml-auto">{t("history.cells", { count: snapshot.cells.length })}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
