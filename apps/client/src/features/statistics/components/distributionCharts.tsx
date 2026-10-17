import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { DatabaseSummary, RegisterRatShare, RegisterSummary } from "../lib/chartData";
import { type StatisticsOperator, operatorDataKey } from "../lib/series";
import type { ChartErrorProps } from "./statChartCard";
import { EvilPieChart, Label, Legend, Pie, Tooltip } from "@/components/evilcharts/charts/pie-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { ErrorState } from "@/components/ui/error-state";

const RAT_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

type PieRow = { name: string; value: number };
type DistributionChartsProps<T> = { data?: T; isLoading: boolean } & ChartErrorProps;
const EMPTY_PIE: { data: PieRow[]; config: ChartConfig } = { data: [], config: {} };

function buildRatPieData(rats: readonly RegisterRatShare[]): { data: PieRow[]; config: ChartConfig } {
  return {
    data: rats.map((rat) => ({ name: rat.rat, value: rat.sites })),
    config: Object.fromEntries(
      rats.map((rat) => {
        const color = RAT_PALETTE[rat.colorIndex % RAT_PALETTE.length];
        return [rat.rat, { label: rat.label, colors: { light: [color], dark: [color] } }];
      }),
    ),
  };
}

function makeLabelFormatter(data: PieRow[], locale: string) {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  return (v: unknown) => {
    const num = typeof v === "number" ? v : 0;
    if (total > 0 && num / total < 0.05) return "";
    return num.toLocaleString(locale);
  };
}

function buildOperatorPieData<T extends { operator: StatisticsOperator }>(
  rows: readonly T[],
  getValue: (row: T) => number,
): { data: PieRow[]; config: ChartConfig } {
  return {
    data: rows.map((row) => ({ name: operatorDataKey(row.operator), value: getValue(row) })),
    config: Object.fromEntries(
      rows.map((row) => {
        const color = row.operator.color;
        return [operatorDataKey(row.operator), { label: row.operator.name, colors: { light: [color], dark: [color] } }];
      }),
    ),
  };
}

function PiePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium leading-none">{title}</h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function DistributionError({ onRetry, isRetrying }: Omit<ChartErrorProps, "isError">) {
  return (
    <div className="relative border border-border p-4">
      <ErrorState onRetry={onRetry} isRetrying={isRetrying} />
    </div>
  );
}

export const RegisterDistributionCharts = memo(function RegisterDistributionCharts({
  data,
  isLoading,
  isError,
  onRetry,
  isRetrying,
}: DistributionChartsProps<RegisterSummary>) {
  const { t, i18n } = useTranslation("statistics");
  const locale = i18n.language;

  const ratPie = useMemo(() => (data?.rats.length ? buildRatPieData(data.rats) : EMPTY_PIE), [data]);
  const operatorPie = useMemo(() => (data?.operators.length ? buildOperatorPieData(data.operators, (row) => row.sites) : EMPTY_PIE), [data]);

  const ratFormatter = useMemo(() => makeLabelFormatter(ratPie.data, locale), [ratPie.data, locale]);
  const operatorFormatter = useMemo(() => makeLabelFormatter(operatorPie.data, locale), [operatorPie.data, locale]);

  if (isError) return <DistributionError onRetry={onRetry} isRetrying={isRetrying} />;

  return (
    <div className="relative border border-border">
      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        <PiePanel title={t("charts.byRat")}>
          <EvilPieChart config={ratPie.config} data={ratPie.data} dataKey="value" nameKey="name" isLoading={isLoading} className="h-64">
            <Pie paddingAngle={4} cornerRadius={8} minAngle={5}>
              <Label labelListProps={{ formatter: ratFormatter }} />
            </Pie>
            <Tooltip locale={locale} />
            <Legend variant="vertical-bar" />
          </EvilPieChart>
        </PiePanel>
        <PiePanel title={t("charts.byOperator")}>
          <EvilPieChart config={operatorPie.config} data={operatorPie.data} dataKey="value" nameKey="name" isLoading={isLoading} className="h-64">
            <Pie paddingAngle={4} cornerRadius={8} minAngle={5}>
              <Label labelListProps={{ formatter: operatorFormatter }} />
            </Pie>
            <Tooltip locale={locale} />
            <Legend variant="vertical-bar" />
          </EvilPieChart>
        </PiePanel>
      </div>
    </div>
  );
});

export const InternalDistributionCharts = memo(function InternalDistributionCharts({
  data,
  isLoading,
  isError,
  onRetry,
  isRetrying,
}: DistributionChartsProps<DatabaseSummary>) {
  const { t, i18n } = useTranslation("statistics");
  const locale = i18n.language;

  const operatorPie = useMemo(() => (data?.operators.length ? buildOperatorPieData(data.operators, (row) => row.stations) : EMPTY_PIE), [data]);

  const formatter = useMemo(() => makeLabelFormatter(operatorPie.data, locale), [operatorPie.data, locale]);

  if (isError) return <DistributionError onRetry={onRetry} isRetrying={isRetrying} />;

  return (
    <div className="relative border border-border">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium leading-none">{t("charts.internalStationsPerOperator")}</h3>
      </div>
      <div className="px-4 py-4">
        <EvilPieChart config={operatorPie.config} data={operatorPie.data} dataKey="value" nameKey="name" isLoading={isLoading} className="h-72">
          <Pie paddingAngle={4} cornerRadius={8} minAngle={5}>
            <Label labelListProps={{ formatter }} />
          </Pie>
          <Tooltip locale={locale} />
          <Legend variant="vertical-bar" />
        </EvilPieChart>
      </div>
    </div>
  );
});
