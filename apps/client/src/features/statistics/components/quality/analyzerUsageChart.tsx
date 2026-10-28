import { Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { defaultPeriod } from "../../lib/periods";
import { analyzerUsageQueryOptions } from "../../queries";
import { BlockHeader } from "../card/statisticsCard";
import { ChartBody } from "../charts/chartBody";
import { StatChart } from "../charts/statChart";
import { PeriodSelects } from "../controls/periodSelects";

const ANALYZER_CHART_HEIGHT = "h-72";

function AllCountriesTag() {
  const { t } = useTranslation("common");

  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
      <HugeiconsIcon icon={Globe02Icon} className="size-3.5" aria-hidden="true" />
      {t("labels.allCountries")}
    </span>
  );
}

export function AnalyzerUsageChart() {
  const { t } = useTranslation("statistics");
  const [period, setPeriod] = useState(() => defaultPeriod("daily"));
  const { data, isLoading, isLoadingError, isFetching, refetch } = useQuery(analyzerUsageQueryOptions(period));
  const series = useMemo(() => [{ key: "count", label: t("completeness.analyzerUsage"), color: "var(--chart-4)" }], [t]);
  const chartData = data ?? [];

  return (
    <div>
      <BlockHeader
        title={t("completeness.analyzerUsage")}
        actions={
          <>
            <AllCountriesTag />
            <PeriodSelects value={period} onChange={setPeriod} />
          </>
        }
      />
      <ChartBody
        heightClassName={ANALYZER_CHART_HEIGHT}
        isError={isLoadingError}
        isEmpty={!isLoading && chartData.length === 0}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      >
        <StatChart type="bar" data={chartData} series={series} dataXKey="date" className={ANALYZER_CHART_HEIGHT} showBrush isLoading={isLoading} />
      </ChartBody>
    </div>
  );
}
