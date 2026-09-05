import { useTranslation } from "react-i18next";

import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { getNsgCellOperator } from "@/lib/nsg/operator";
import type { NsgSnapshot } from "@/lib/nsg/snapshots";

import { getDisplayRat, getMobileSummaryFields } from "./cellPresentation";
import { formatValue } from "./display";
import { OperatorName } from "./operatorName";

export function MobileSummary({ snapshot }: { snapshot: NsgSnapshot | null }) {
  const { t } = useTranslation("nsg");
  if (!snapshot) return null;

  const registered = snapshot.cells.filter((cell) => cell.registered === true);
  const cell = registered.length === 1 ? registered[0] : null;

  if (!cell)
    return (
      <p className="shrink-0 border-b px-3 py-2 text-sm text-muted-foreground">
        {t(registered.length > 1 ? "snapshot.registeredCells" : "snapshot.noServing", { count: registered.length })}
      </p>
    );

  const signal = formatValue(cell.dbm);

  return (
    <section className="shrink-0 border-b bg-background px-3 py-2" aria-label={t("snapshot.serving")} data-testid="nsg-mobile-summary">
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
        {getMobileSummaryFields(cell).map(({ key, label, value, unit }) => {
          const formatted = formatValue(value);
          return (
            <div key={key} className="min-w-0">
              <dt className="text-[10px] leading-4 text-muted-foreground">{label}</dt>
              <dd className="m-0 whitespace-nowrap font-mono text-xs font-medium leading-4 tabular-nums">
                {formatted}
                {unit && formatted !== "-" ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span> : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
