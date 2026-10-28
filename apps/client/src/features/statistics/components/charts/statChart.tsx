import { useReducedMotion } from "motion/react";
import { type ReactNode, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { Series } from "../../lib/chartData";
import * as AreaChartImport from "@/components/evilcharts/charts/area-chart";
import * as BarChartImport from "@/components/evilcharts/charts/bar-chart";
import * as LineChartImport from "@/components/evilcharts/charts/line-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

export type ChartType = "area" | "line" | "bar";

type StatChartProps = {
  type: ChartType;
  data: Record<string, string | number>[];
  series: Series[];
  dataXKey: string;
  stacked?: boolean;
  className?: string;
  isLoading?: boolean;
  showBrush?: boolean;
  showDelta?: boolean;
  connectNulls?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  selectedKey?: string | null;
  onSelectedKeyChange?: (key: string | null) => void;
};

function buildConfig(series: Series[]): ChartConfig {
  return Object.fromEntries(series.map((entry) => [entry.key, { label: entry.label, colors: { light: [entry.color], dark: [entry.color] } }]));
}

function makeDeltaValueFormatter(locale: string) {
  return function deltaValueFormatter(value: number, dataKey: string, payload: Record<string, unknown>): ReactNode {
    const change = payload[`${dataKey}_change`];
    const delta = payload[`${dataKey}_delta`];
    if (typeof change !== "number" || typeof delta !== "number" || delta === 0) return value.toLocaleString(locale);

    const sign = delta > 0 ? "+" : "";
    return (
      <>
        {value.toLocaleString(locale)}
        <span className={cn("ml-1.5 font-normal", delta > 0 ? "text-emerald-500" : "text-red-500")}>
          {`${sign}${change.toFixed(2)}% (${sign}${delta.toLocaleString(locale)})`}
        </span>
      </>
    );
  };
}

export const StatChart = memo(function StatChart({
  type,
  data,
  series,
  dataXKey,
  stacked,
  className,
  isLoading,
  showBrush = false,
  showDelta = false,
  connectNulls = false,
  showDots = true,
  showLegend = true,
  selectedKey,
  onSelectedKeyChange,
}: StatChartProps) {
  const prefersReducedMotion = useReducedMotion() === true;
  const isMobile = useIsMobile();
  const { i18n } = useTranslation();
  const config = useMemo(() => buildConfig(series), [series]);
  const rootProps = {
    data,
    config,
    isLoading,
    showBrush,
    className,
    xDataKey: dataXKey,
    animationType: prefersReducedMotion ? "none" : "left-to-right",
    selectedDataKey: selectedKey,
    onSelectionChange: onSelectedKeyChange,
  } as const;
  const valueFormatter = useMemo(() => (showDelta ? makeDeltaValueFormatter(i18n.language) : undefined), [showDelta, i18n.language]);
  const yAxisWidth = isMobile ? "auto" : undefined;

  if (type === "area") {
    const { EvilAreaChart, Area, ActiveDot, Dot, Grid, XAxis, YAxis, Tooltip, Legend } = AreaChartImport;
    return (
      <EvilAreaChart {...rootProps} stackType={stacked ? "stacked" : "default"} curveType="monotoneX">
        <Grid />
        <XAxis dataKey={dataXKey} />
        <YAxis locale={i18n.language} width={yAxisWidth} />
        <Tooltip valueFormatter={valueFormatter} locale={i18n.language} />
        {showLegend ? <Legend isClickable variant="vertical-bar" /> : null}
        {series.map((entry) => (
          <Area key={entry.key} dataKey={entry.key} variant="gradient" isClickable>
            {showDots ? <Dot variant="colored-border" /> : null}
            <ActiveDot variant="border" />
          </Area>
        ))}
      </EvilAreaChart>
    );
  }
  if (type === "line") {
    const { EvilLineChart, Line, ActiveDot, Dot, Grid, XAxis, YAxis, Tooltip, Legend } = LineChartImport;
    return (
      <EvilLineChart {...rootProps}>
        <Grid />
        <XAxis dataKey={dataXKey} />
        <YAxis locale={i18n.language} width={yAxisWidth} />
        <Tooltip valueFormatter={valueFormatter} locale={i18n.language} />
        {showLegend ? <Legend isClickable variant="vertical-bar" /> : null}
        {series.map((entry) => (
          <Line key={entry.key} dataKey={entry.key} isClickable connectNulls={connectNulls}>
            {showDots ? <Dot variant="colored-border" /> : null}
            <ActiveDot variant="border" />
          </Line>
        ))}
      </EvilLineChart>
    );
  }

  const { EvilBarChart, Bar, Grid, XAxis, YAxis, Tooltip, Legend } = BarChartImport;
  return (
    <EvilBarChart {...rootProps} stackType={stacked ? "stacked" : "default"}>
      <Grid />
      <XAxis dataKey={dataXKey} />
      <YAxis locale={i18n.language} width={yAxisWidth} />
      <Tooltip valueFormatter={valueFormatter} locale={i18n.language} />
      {showLegend ? <Legend isClickable variant="vertical-bar" /> : null}
      {series.map((entry) => (
        <Bar key={entry.key} dataKey={entry.key} isClickable />
      ))}
    </EvilBarChart>
  );
});
