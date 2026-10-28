import { useTranslation } from "react-i18next";

import { type Granularity, PERIOD_SPANS, type Period, type PeriodSpan, defaultPeriod } from "../../lib/periods";
import { ToolbarSelect } from "./toolbarSelect";

type PeriodSelectsProps = { value: Period; onChange: (period: Period) => void; showLabels?: boolean; granularities?: readonly Granularity[] };

const GRANULARITIES: readonly Granularity[] = ["monthly", "daily"];

export function PeriodSelects({ value, onChange, showLabels = false, granularities = GRANULARITIES }: PeriodSelectsProps) {
  const { t } = useTranslation("statistics");
  const spans = PERIOD_SPANS[value.granularity];

  function formatSpan(span: PeriodSpan): string {
    if (span === "all") return t("filters.everything");
    return value.granularity === "monthly" ? t("filters.months", { count: span }) : t("main:filters.recentDaysValue", { count: span });
  }

  const granularityItems = granularities.map((granularity) => ({ value: granularity, label: t(`filters.${granularity}`) }));
  const spanItems = spans.map((span) => ({ value: String(span), label: formatSpan(span) }));

  function changeGranularity(next: unknown) {
    const granularity = granularities.find((candidate) => candidate === next);
    if (granularity !== undefined && granularity !== value.granularity) onChange(defaultPeriod(granularity));
  }

  function changeSpan(next: unknown) {
    const span = spans.find((candidate) => String(candidate) === next);
    if (span !== undefined) onChange({ granularity: value.granularity, span });
  }

  return (
    <>
      {granularities.length > 1 ? (
        <ToolbarSelect
          label={t("filters.granularity")}
          showLabel={showLabels}
          value={value.granularity}
          items={granularityItems}
          onValueChange={changeGranularity}
          triggerClassName="sm:w-30"
        />
      ) : null}
      <ToolbarSelect
        label={t("filters.range")}
        showLabel={showLabels}
        value={String(value.span)}
        items={spanItems}
        onValueChange={changeSpan}
        triggerClassName="sm:w-32"
      />
    </>
  );
}
