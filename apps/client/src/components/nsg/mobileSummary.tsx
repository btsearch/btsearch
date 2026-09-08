import { memo } from "react";
import { useTranslation } from "react-i18next";

import { getCellOperator } from "@/features/nsg-explorer/cells/operators";
import type { Snapshot } from "@/features/nsg-explorer/cells/snapshots";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import type { NsgCell } from "@/lib/nsg-parser/model";

import { getDisplayRat, getHeadlineSignal, getMobileSummaryFields } from "./cellPresentation";
import { formatDecibelValue, formatValue } from "./display";
import { OperatorName } from "./operatorName";
import { type NsaAggregation, createNsaAggregation, getNsaCarrierRoleLabelKey, isNsaAggregationCell } from "./snapshotPresentation";

function MobileCellSummary({ cell, label }: { cell: Snapshot["cells"][number]; label: string }) {
  const headlineSignal = getHeadlineSignal(cell);
  const signal = formatDecibelValue(headlineSignal.value);

  return (
    <div className="border-t px-3 py-2 first:border-t-0">
      <p className="mb-1 text-[10px] font-medium text-muted-foreground">{label}</p>
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <RatGenerationLabel rat={getDisplayRat(cell.rat)} />
        <span className="text-sm font-semibold">{cell.rat}</span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <OperatorName operator={getCellOperator(cell)} labelClassName="truncate text-sm" />
        </div>
        <p className="shrink-0 font-mono text-base font-semibold tabular-nums">
          {signal}
          {signal !== "-" ? <span className="ml-1 text-xs font-normal text-muted-foreground">{headlineSignal.suffix}</span> : null}
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

function MobileNsaSummary({ aggregation }: { aggregation: NsaAggregation }) {
  const { t } = useTranslation("nsg");

  return (
    <div className="border-t first:border-t-0">
      <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5">
        <RatGenerationLabel rat="NR" />
        <span className="min-w-0 flex-1 text-xs font-semibold">{t("snapshot.nsaGroup")}</span>
      </div>
      {aggregation.carriers.flatMap((carrier) => {
        const label = t(getNsaCarrierRoleLabelKey(carrier.role));
        return carrier.serving.map((cell) => (
          <MobileCellSummary key={`${cell.recordOffset}:${cell.cellIndex}:${cell.rat}:${cell.measurementRole}`} cell={cell} label={label} />
        ));
      })}
      {aggregation.anchors.map((cell) => (
        <MobileCellSummary
          key={`${cell.recordOffset}:${cell.cellIndex}:${cell.rat}:${cell.measurementRole}`}
          cell={cell}
          label={t("snapshot.ltePrimaryCell")}
        />
      ))}
    </div>
  );
}

export const MobileSummary = memo(function MobileSummary({ snapshot }: { snapshot: Snapshot | null }) {
  const { t } = useTranslation("nsg");
  if (!snapshot) return null;

  const nsaAggregation = createNsaAggregation(snapshot.cells);
  const registered: NsgCell[] = [];
  for (const cell of snapshot.cells) {
    if (cell.registered === true && !isNsaAggregationCell(cell)) registered.push(cell);
  }
  const hasNsaServingCells =
    nsaAggregation !== null && (nsaAggregation.anchors.length > 0 || nsaAggregation.carriers.some((carrier) => carrier.serving.length > 0));

  if (registered.length === 0 && !hasNsaServingCells)
    return <p className="shrink-0 border-b px-3 py-2 text-sm text-muted-foreground">{t("snapshot.noServing")}</p>;

  return (
    <section className="shrink-0 border-b bg-background" aria-label={t("snapshot.title")} data-testid="nsg-mobile-summary">
      {hasNsaServingCells && nsaAggregation ? <MobileNsaSummary aggregation={nsaAggregation} /> : null}
      {registered.map((cell) => (
        <MobileCellSummary
          key={`${cell.recordOffset}:${cell.cellIndex}:${cell.rat}:${cell.measurementRole ?? "cell"}`}
          cell={cell}
          label={t("snapshot.serving")}
        />
      ))}
    </section>
  );
});
