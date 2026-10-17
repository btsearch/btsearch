import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type OperatorValue, toStackedBars } from "../lib/series";
import { type ChartErrorProps, StatChartCard } from "./statChartCard";

type BandBarChartProps = { data?: OperatorValue[]; isLoading: boolean } & ChartErrorProps;

function useBarData(values: OperatorValue[] | undefined) {
  return useMemo(() => (values?.length ? toStackedBars(values, "band") : { data: [], series: [] }), [values]);
}

export function RegisterBandBarChart({ data, isLoading, ...errorProps }: BandBarChartProps) {
  const { t } = useTranslation("statistics");
  const { data: chartData, series } = useBarData(data);

  return (
    <StatChartCard
      title={t("charts.byBand")}
      data={chartData}
      series={series}
      dataXKey="band"
      stacked
      height="h-96"
      isLoading={isLoading}
      {...errorProps}
    />
  );
}

export function InternalBandStationsBarChart({ data, isLoading, ...errorProps }: BandBarChartProps) {
  const { t } = useTranslation("statistics");
  const { data: chartData, series } = useBarData(data);

  return (
    <StatChartCard
      title={t("charts.internalStationsByBand")}
      data={chartData}
      series={series}
      dataXKey="band"
      stacked
      height="h-96"
      isLoading={isLoading}
      {...errorProps}
    />
  );
}
