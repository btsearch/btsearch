import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { defaultPeriod } from "../../lib/periods";
import { contributionsQueryOptions } from "../../queries";
import { BlockHeader } from "../card/statisticsCard";
import { ChartBody } from "../charts/chartBody";
import { StatChart } from "../charts/statChart";
import { PeriodSelects } from "../controls/periodSelects";

const CONTRIBUTIONS_CHART_HEIGHT = "h-80";

export function ContributionsChart({ countryCode }: { countryCode: string }) {
  const { t } = useTranslation("statistics");
  const [period, setPeriod] = useState(() => defaultPeriod("monthly"));
  const { data, isLoading, isLoadingError, isFetching, refetch } = useQuery(contributionsQueryOptions(countryCode, period));
  const chartData = data ?? [];
  const series = useMemo(
    () => [
      { key: "sectors", label: t("common:labels.azimuths"), color: "var(--chart-1)" },
      { key: "identifiers", label: t("contributions.extraIds"), color: "var(--chart-2)" },
      { key: "cellsWithPci", label: t("contributions.cellsWithPci"), color: "var(--chart-3)" },
    ],
    [t],
  );

  return (
    <div>
      <BlockHeader title={t("contributions.title")} actions={<PeriodSelects value={period} onChange={setPeriod} />} />
      <ChartBody
        heightClassName={CONTRIBUTIONS_CHART_HEIGHT}
        isError={isLoadingError}
        isEmpty={!isLoading && chartData.length === 0}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      >
        <StatChart
          type="bar"
          data={chartData}
          series={series}
          dataXKey="date"
          stacked
          className={CONTRIBUTIONS_CHART_HEIGHT}
          showBrush
          isLoading={isLoading}
        />
      </ChartBody>
    </div>
  );
}
