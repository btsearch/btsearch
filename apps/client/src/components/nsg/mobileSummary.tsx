import { memo } from "react";
import { useTranslation } from "react-i18next";

import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { getNsgCellOperator } from "@/lib/nsg/operator";
import type { NsgSnapshot } from "@/lib/nsg/snapshots";
import type { NsgCell } from "@/lib/nsg/types";

import { getDisplayRat, getMobileSummaryFields } from "./cellPresentation";
import { formatDecibelValue, formatValue } from "./display";
import { OperatorName } from "./operatorName";

function MobileCellSummary({ cell, label }: { cell: NsgSnapshot["cells"][number]; label: string }) {
  const signal = formatDecibelValue(cell.dbm ?? cell.rsrp);

  return (
    <div className="border-t px-3 py-2 first:border-t-0">
      <p className="mb-1 text-[10px] font-medium text-muted-foreground">{label}</p>
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <RatGenerationLabel rat={getDisplayRat(cell.rat)} />
        <span className="text-sm font-semibold">{cell.rat}</span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <OperatorName operator={getNsgCellOperator(cell)} labelClassName="truncate text-sm" />
        </div>
        <p className="shrink-0 font-mono text-base font-semibold tabular-nums">
          {signal}
          {signal !== "-" ? <span className="ml-1 text-xs font-normal text-muted-foreground">dBm</span> : null}
        </p>
      </div>
      <dl className="grid grid-cols-4 gap-x-3 gap-y-1.5 [@media(min-width:640px)_and_(max-height:500px)]:grid-cols-8">
        {getMobileSummaryFields(cell).map(({ key, label: fieldLabel, value, unit }) => {
          const formatted = unit === "dBm" || unit === "dB" ? formatDecibelValue(value) : formatValue(value);
          return (
            <div key={key} className="min-w-0">
              <dt className="text-[10px] leading-4 text-muted-foreground">{fieldLabel}</dt>
              <dd className="m-0 whitespace-nowrap font-mono text-xs font-medium leading-4 tabular-nums">
                {formatted}
                {unit && formatted !== "-" ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span> : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export const MobileSummary = memo(function MobileSummary({ snapshot }: { snapshot: NsgSnapshot | null }) {
  const { t } = useTranslation("nsg");
  if (!snapshot) return null;

  const registered: NsgCell[] = [];
  const nrPrimary: NsgCell[] = [];
  for (const cell of snapshot.cells) {
    if (cell.registered === true) registered.push(cell);
    if (cell.measurementRole === "nr-primary") nrPrimary.push(cell);
  }
  const cells = nrPrimary.length > 0 ? [...nrPrimary, ...registered] : registered;

  if (cells.length === 0) return <p className="shrink-0 border-b px-3 py-2 text-sm text-muted-foreground">{t("snapshot.noServing")}</p>;

  return (
    <section className="shrink-0 border-b bg-background" aria-label={t("snapshot.title")} data-testid="nsg-mobile-summary">
      {cells.map((cell) => {
        let label = t("snapshot.serving");
        if (cell.measurementRole === "nr-primary") label = t("snapshot.nrPrimaryCells", { count: 1 });
        else if (cell.measurementRole === "lte-secondary") label = t("snapshot.lteSecondaryCells", { count: 1 });
        return (
          <MobileCellSummary key={`${cell.recordOffset}:${cell.cellIndex}:${cell.rat}:${cell.measurementRole ?? "cell"}`} cell={cell} label={label} />
        );
      })}
    </section>
  );
});
