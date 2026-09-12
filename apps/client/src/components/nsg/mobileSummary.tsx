import { memo } from "react";
import { useTranslation } from "react-i18next";

import { getDisplayRat, getHeadlineSignal, getMobileSummaryFields } from "./cellPresentation";
import { formatDecibelValue, formatValue } from "./display";
import { OperatorName } from "./operatorName";
import {
  type NsaAggregation,
  createNsaAggregation,
  createNsaPresentationSections,
  getNsaCarrierRoleAbbreviation,
  getNsaCarrierRoleLabelKey,
  isNsaAggregationCell,
} from "./snapshotPresentation";
import { getCellOperator } from "@/features/nsg-explorer/cells/operators";
import type { Snapshot } from "@/features/nsg-explorer/cells/snapshots";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import type { NsgCell } from "@/lib/nsg-parser/model";

const MOBILE_AGGREGATE_FIELD_KEYS = new Set(["pci", "arfcn", "earfcn", "rsrq", "sinr"]);

type MobileSummaryFields = ReturnType<typeof getMobileSummaryFields>;

function getMeasurementGridClassName(aggregate: boolean, fieldCount: number): string {
  if (!aggregate) return "grid grid-cols-4 gap-x-3 gap-y-1 [@media(min-width:640px)_and_(max-height:500px)]:grid-cols-8";
  if (fieldCount === 3) return "grid grid-cols-[3fr_5fr_4fr] gap-x-2";
  return "grid grid-cols-[3fr_5fr_4fr_3fr] gap-x-2";
}

function MobileMeasurementGrid({ fields, aggregate = false }: { fields: MobileSummaryFields; aggregate?: boolean }) {
  return (
    <dl className={getMeasurementGridClassName(aggregate, fields.length)}>
      {fields.map(({ key, label, value, unit }) => {
        const formatted = unit === "dBm" || unit === "dB" ? formatDecibelValue(value) : formatValue(value);
        return (
          <div key={key} className="min-w-0 [@media(min-width:380px)]:flex [@media(min-width:380px)]:items-baseline [@media(min-width:380px)]:gap-1">
            <dt className="text-[10px] leading-3 text-muted-foreground">{label}</dt>
            <dd className="m-0 whitespace-nowrap font-mono text-xs font-medium leading-3 tabular-nums">
              {formatted}
              {unit && formatted !== "-" ? <span className="ml-1 text-[9px] font-normal text-muted-foreground">{unit}</span> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function MobileCellSummary({ cell, label }: { cell: Snapshot["cells"][number]; label: string }) {
  const headlineSignal = getHeadlineSignal(cell);
  const signal = formatDecibelValue(headlineSignal.value);

  return (
    <div className="border-t px-3 py-1.5 first:border-t-0">
      <div className="flex min-w-0 items-baseline gap-2">
        <p className="min-w-0 flex-1 text-[10px] font-medium leading-4 text-muted-foreground">{label}</p>
        <p className="shrink-0 font-mono text-base font-semibold tabular-nums">
          {signal}
          {signal !== "-" ? <span className="ml-1 text-xs font-normal text-muted-foreground">{headlineSignal.suffix}</span> : null}
        </p>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <RatGenerationLabel rat={getDisplayRat(cell.rat)} />
        <span className="text-sm font-semibold">{cell.rat}</span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <OperatorName operator={getCellOperator(cell)} labelClassName="truncate text-sm" />
        </div>
      </div>
      <div className="mt-1.5">
        <MobileMeasurementGrid fields={getMobileSummaryFields(cell)} />
      </div>
    </div>
  );
}

function MobileAggregateCellRow({
  cell,
  label,
  accessibleLabel,
  showGenerationBadge = false,
  showOperator = false,
}: {
  cell: Snapshot["cells"][number];
  label: string;
  accessibleLabel: string;
  showGenerationBadge?: boolean;
  showOperator?: boolean;
}) {
  const headlineSignal = getHeadlineSignal(cell);
  const signal = formatDecibelValue(headlineSignal.value);
  const fields = getMobileSummaryFields(cell).filter(({ key, value }) => MOBILE_AGGREGATE_FIELD_KEYS.has(key) && (key !== "sinr" || value !== null));

  return (
    <div className="px-3 py-1">
      <div className="flex min-w-0 items-center gap-1.5">
        {showGenerationBadge ? <RatGenerationLabel rat={getDisplayRat(cell.rat)} /> : null}
        <span className="sr-only">{accessibleLabel}</span>
        <span className="shrink-0 text-xs font-semibold leading-4" aria-hidden="true">
          {label}
        </span>
        {showOperator ? (
          <div className="min-w-0 flex-1 overflow-hidden">
            <OperatorName operator={getCellOperator(cell)} labelClassName="truncate text-xs" />
          </div>
        ) : null}
        <p className="ml-auto shrink-0 whitespace-nowrap font-mono text-sm font-semibold leading-4 tabular-nums">
          {signal}
          {signal !== "-" ? <span className="ml-1 text-[9px] font-normal text-muted-foreground">{headlineSignal.suffix}</span> : null}
        </p>
      </div>
      <div className="mt-1">
        <MobileMeasurementGrid fields={fields} aggregate />
      </div>
    </div>
  );
}

function MobileNsaSummary({ aggregation }: { aggregation: NsaAggregation }) {
  const { t } = useTranslation("nsg");
  const sections = createNsaPresentationSections(aggregation);
  const hasNrServing = sections.some((section) => section.kind === "nr-serving");

  return (
    <div className="divide-y" role="group" aria-label="NR NSA">
      {sections.map((section) => {
        switch (section.kind) {
          case "nr-serving": {
            const role = getNsaCarrierRoleAbbreviation(section.role);
            const label = role === null ? "NR NSA" : `NR NSA (${role})`;
            return (
              <MobileAggregateCellRow
                key={section.key}
                cell={section.cell}
                label={label}
                accessibleLabel={t(getNsaCarrierRoleLabelKey(section.role), { mode: "NSA" })}
                showGenerationBadge={section.showRadioContext}
                showOperator={section.showRadioContext}
              />
            );
          }
          case "nr-neighbors":
            return null;
          case "lte-anchor":
            return section.cells.map((cell, index) => (
              <MobileAggregateCellRow
                key={`${cell.recordOffset}:${cell.cellIndex}:${cell.rat}:${cell.measurementRole}`}
                cell={cell}
                label={t("snapshot.ltePrimaryCell")}
                accessibleLabel={t("snapshot.ltePrimaryCell")}
                showGenerationBadge
                showOperator={!hasNrServing && index === 0}
              />
            ));
        }
      })}
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
    <section
      className="custom-scrollbar max-h-[min(36svh,12rem)] shrink-0 overflow-y-auto overscroll-contain border-b bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={t("snapshot.title")}
      data-testid="nsg-mobile-summary"
      tabIndex={0}
    >
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
