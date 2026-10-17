import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type OperatorValue, toStackedBars } from "../lib/series";
import { type ChartErrorProps, StatChartCard } from "./statChartCard";

type RegionChartProps = { data?: OperatorValue[]; isLoading: boolean } & ChartErrorProps;

function useRegionBarData(values: OperatorValue[] | undefined) {
  return useMemo(() => {
    if (!values?.length) return { chartData: [], series: [] };

    const { data, series } = toStackedBars(values, "region");
    const chartData = data
      .map((row) => {
        const total = Object.entries(row).reduce((sum, [key, value]) => (key !== "region" && typeof value === "number" ? sum + value : sum), 0);
        return { ...row, total };
      })
      .sort((a, b) => b.total - a.total);

    return { chartData, series };
  }, [values]);
}

export function RegisterRegionChart({ data, isLoading, ...errorProps }: RegionChartProps) {
  const { t } = useTranslation("statistics");
  const { chartData, series } = useRegionBarData(data);

  return (
    <StatChartCard
      title={t("charts.byVoivodeship")}
      data={chartData}
      series={series}
      dataXKey="region"
      stacked
      height="h-140"
      showBrush
      isLoading={isLoading}
      {...errorProps}
    />
  );
}

export function InternalRegionChart({ data, isLoading, ...errorProps }: RegionChartProps) {
  const { t } = useTranslation("statistics");
  const { chartData, series } = useRegionBarData(data);

  return (
    <StatChartCard
      title={t("charts.internalByVoivodeship")}
      data={chartData}
      series={series}
      dataXKey="region"
      stacked
      height="h-140"
      showBrush
      isLoading={isLoading}
      {...errorProps}
    />
  );
}
