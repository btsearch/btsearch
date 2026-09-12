import { useReducedMotion } from "motion/react";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ChartType } from "./chartTypeContext";
import * as AreaChartImport from "@/components/evilcharts/charts/area-chart";
import * as BarChartImport from "@/components/evilcharts/charts/bar-chart";
import * as LineChartImport from "@/components/evilcharts/charts/line-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import type { ChartLegendVariant } from "@/components/evilcharts/ui/legend";

export interface Series {
  key: string;
  label: string;
  color: string;
}

interface StatChartProps {
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
  legendVariant?: ChartLegendVariant;
}

function buildConfig(series: Series[]): ChartConfig {
  return Object.fromEntries(series.map((s) => [s.key, { label: s.label, colors: { light: [s.color], dark: [s.color] } }]));
}

export function makeDeltaValueFormatter(locale: string) {
  return function deltaValueFormatter(value: number, dataKey: string, payload: Record<string, unknown>): React.ReactNode {
    const change = payload[`${dataKey}_change`];
    const delta = payload[`${dataKey}_delta`];
    const isPositive = typeof delta === "number" ? delta >= 0 : typeof change === "number" ? change >= 0 : true;
    const isEffectivelyZero = (typeof change !== "number" || Math.abs(change) < 0.005) && (typeof delta !== "number" || Math.abs(delta) < 0.5);
    const sign = isPositive ? "+" : "";
    const changePart = !isEffectivelyZero && typeof change === "number" ? `${sign}${change.toFixed(2)}%` : "";
    const deltaPart = !isEffectivelyZero && typeof delta === "number" ? ` (${sign}${delta.toLocaleString(locale)})` : "";
    return (
      <>
        {value.toLocaleString(locale)}
        {(changePart || deltaPart) && (
          <span className={`ml-1.5 font-normal ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
            {changePart}
            {deltaPart}
          </span>
        )}
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
  legendVariant = "vertical-bar",
}: StatChartProps) {
  const reduce = useReducedMotion() === true;
  const { i18n } = useTranslation();
  const config = useMemo(() => buildConfig(series), [series]);
  const common = { data, config, isLoading, showBrush, className, xDataKey: dataXKey, animationType: reduce ? "none" : "left-to-right" } as const;
  const valueFormatter = useMemo(() => (showDelta ? makeDeltaValueFormatter(i18n.language) : undefined), [showDelta, i18n.language]);

  if (type === "area") {
    const { EvilAreaChart, Area, ActiveDot, Dot, Grid, XAxis, YAxis, Tooltip, Legend } = AreaChartImport;
    return (
      <EvilAreaChart {...common} stackType={stacked ? "stacked" : "default"} curveType="monotoneX">
        <Grid />
        <XAxis dataKey={dataXKey} />
        <YAxis locale={i18n.language} />
        <Tooltip valueFormatter={valueFormatter} locale={i18n.language} />
        <Legend isClickable variant={legendVariant} />
        {series.map((s) => (
          <Area key={s.key} dataKey={s.key} variant="gradient" isClickable>
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
      <EvilLineChart {...common}>
        <Grid />
        <XAxis dataKey={dataXKey} />
        <YAxis locale={i18n.language} />
        <Tooltip valueFormatter={valueFormatter} locale={i18n.language} />
        <Legend isClickable variant={legendVariant} />
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} isClickable connectNulls={connectNulls}>
            {showDots ? <Dot variant="colored-border" /> : null}
            <ActiveDot variant="border" />
          </Line>
        ))}
      </EvilLineChart>
    );
  }
  if (type === "bar") {
    const { EvilBarChart, Bar, Grid, XAxis, YAxis, Tooltip, Legend } = BarChartImport;
    return (
      <EvilBarChart {...common} stackType={stacked ? "stacked" : "default"}>
        <Grid />
        <XAxis dataKey={dataXKey} />
        <YAxis locale={i18n.language} />
        <Tooltip valueFormatter={valueFormatter} locale={i18n.language} />
        <Legend isClickable variant={legendVariant} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} isClickable />
        ))}
      </EvilBarChart>
    );
  }
});
