import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { StatsOperator, VoivodeshipInternalRow, VoivodeshipUkeRow } from "../api";
import { operatorDataKey, operatorSeries } from "../lib/series";
import { type ChartErrorProps, StatChartCard } from "./statChartCard";

type VoivodeshipChartProps<T> = { data?: T[]; isLoading: boolean } & ChartErrorProps;

function useRegionBarData(rows: { operator: StatsOperator; region: { name: string } }[] | undefined, valueKey: string) {
  return useMemo(() => {
    if (!rows?.length) return { chartData: [], series: [] };

    const regionMap = new Map<string, Record<string, string | number>>();

    for (const row of rows) {
      const existing = regionMap.get(row.region.name) ?? { region: row.region.name };
      existing[operatorDataKey(row.operator)] = (row as Record<string, unknown>)[valueKey] as number;
      regionMap.set(row.region.name, existing);
    }

    const chartData = [...regionMap.values()]
      .map((row) => {
        const total = Object.entries(row).reduce((sum, [key, value]) => (key !== "region" && typeof value === "number" ? sum + value : sum), 0);
        return { ...row, total };
      })
      .sort((a, b) => (b.total as number) - (a.total as number));

    return {
      chartData,
      series: operatorSeries(rows.map((row) => row.operator)),
    };
  }, [rows, valueKey]);
}

export function UkeVoivodeshipChart({ data, isLoading, ...errorProps }: VoivodeshipChartProps<VoivodeshipUkeRow>) {
  const { t } = useTranslation("statistics");
  const { chartData, series } = useRegionBarData(data, "unique_stations");

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

export function InternalVoivodeshipChart({ data, isLoading, ...errorProps }: VoivodeshipChartProps<VoivodeshipInternalRow>) {
  const { t } = useTranslation("statistics");
  const { chartData, series } = useRegionBarData(data, "stations");

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
