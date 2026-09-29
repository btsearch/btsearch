import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { analyzerUsageQueryOptions } from "../queries";
import { GranularitySelect } from "./granularitySelect";
import { StatChartCard } from "./statChartCard";

export function AnalyzerUsageChart() {
  const { t } = useTranslation("statistics");
  const [granularity, setGranularity] = useState<"daily" | "monthly">("daily");
  const { data, isLoading, isLoadingError, isFetching, refetch } = useQuery(analyzerUsageQueryOptions({ granularity }));
  const series = useMemo(() => [{ key: "count", label: t("completeness.analyzerUsage"), color: "var(--chart-4)" }], [t]);
  const chartData = useMemo(() => data?.map((row) => ({ date: row.date, count: row.count })) ?? [], [data]);
  return (
    <StatChartCard
      title={t("completeness.analyzerUsage")}
      toolbar={<GranularitySelect value={granularity} onChange={setGranularity} />}
      data={chartData}
      series={series}
      dataXKey="date"
      height="h-72"
      showBrush
      isLoading={isLoading}
      isError={isLoadingError}
      onRetry={() => refetch()}
      isRetrying={isFetching}
    />
  );
}
