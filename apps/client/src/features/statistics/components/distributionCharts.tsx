import { useQuery } from "@tanstack/react-query";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { StatsOperator, StatsSummary } from "../api";
import { operatorColor, operatorDataKey } from "../lib/series";
import type { ChartErrorProps } from "./statChartCard";
import { EvilPieChart, Label, Legend, Pie, Tooltip } from "@/components/evilcharts/charts/pie-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { ErrorState } from "@/components/ui/error-state";
import { registerBandsQueryOptions } from "@/features/map/api";
import { compareRatsByName, toRegisterRatComparator } from "@/features/shared/rat";
import type { Band } from "@/types/station";

const RAT_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

type PieRow = { name: string; value: number };
type DistributionChartsProps = { data?: StatsSummary; isLoading: boolean } & ChartErrorProps;
const EMPTY_PIE: { data: PieRow[]; config: ChartConfig } = { data: [], config: {} };

function buildRatPieData(
  rows: StatsSummary["by_rat"],
  registerBands: readonly Pick<Band, "rat">[] | undefined,
): { data: PieRow[]; config: ChartConfig } {
  const compareRats = registerBands === undefined ? compareRatsByName : toRegisterRatComparator(registerBands);
  const ratOrder = [...new Set([...(registerBands ?? []).map((band) => band.rat), ...rows.map((row) => row.rat)])].sort(compareRats);
  const sortedRows = [...rows].sort((left, right) => compareRats(left.rat, right.rat));

  return {
    data: sortedRows.map((row) => ({ name: row.rat, value: row.unique_stations })),
    config: Object.fromEntries(
      sortedRows.map((row) => {
        const color = RAT_PALETTE[ratOrder.indexOf(row.rat) % RAT_PALETTE.length];
        return [row.rat, { label: row.rat, colors: { light: [color], dark: [color] } }];
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

function buildOperatorPieData<T extends { operator: StatsOperator }>(
  rows: T[],
  getValue: (row: T) => number,
): { data: PieRow[]; config: ChartConfig } {
  return {
    data: rows.map((row) => ({ name: operatorDataKey(row.operator), value: getValue(row) })),
    config: Object.fromEntries(
      rows.map((row) => {
        const key = operatorDataKey(row.operator);
        const color = operatorColor(row.operator);
        return [key, { label: row.operator.name, colors: { light: [color], dark: [color] } }];
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

export const UkeDistributionCharts = memo(function UkeDistributionCharts({ data, isLoading, isError, onRetry, isRetrying }: DistributionChartsProps) {
  const { t, i18n } = useTranslation("statistics");
  const locale = i18n.language;
  const { data: registerBands } = useQuery(registerBandsQueryOptions());

  const ratPie = useMemo(() => (data?.by_rat.length ? buildRatPieData(data.by_rat, registerBands) : EMPTY_PIE), [data, registerBands]);
  const operatorPie = useMemo(
    () => (data?.by_operator.length ? buildOperatorPieData(data.by_operator, (row) => row.unique_stations) : EMPTY_PIE),
    [data],
  );

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
}: DistributionChartsProps) {
  const { t, i18n } = useTranslation("statistics");
  const locale = i18n.language;

  const operatorPie = useMemo(
    () => (data?.internal.by_operator.length ? buildOperatorPieData(data.internal.by_operator, (row) => row.stations) : EMPTY_PIE),
    [data],
  );

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
