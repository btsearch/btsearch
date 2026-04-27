import { useQuery } from "@tanstack/react-query";
import React, { type ComponentProps, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  useChart,
} from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getOperatorColor, getOperatorSortIndex, resolveOperatorMnc } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator } from "@/types/station";

import type { StatsHistoryRow, StatsStationsHistoryRow } from "../api";
import { statsHistoryQueryOptions, statsStationsHistoryQueryOptions } from "../queries";

type ViewMode = "by-band" | "by-operator";

interface ChartOperator {
  name: string;
  color: string;
}

interface ChartData {
  chartData: Record<string, string | number>[];
  operators: ChartOperator[];
}

interface BandChartData extends ChartData {
  bandName: string;
}

function buildChartData(rows: { date: string; operator: { name: string }; unique_stations: number }[]): ChartData {
  const dateMap = new Map<string, Record<string, string | number>>();
  const operatorSet = new Map<string, ChartOperator>();

  for (const row of rows) {
    if (!operatorSet.has(row.operator.name)) {
      const mnc = resolveOperatorMnc(null, row.operator.name);
      operatorSet.set(row.operator.name, {
        name: row.operator.name,
        color: mnc ? getOperatorColor(mnc) : "#94a3b8",
      });
    }
    const existing = dateMap.get(row.date) ?? { date: row.date };
    existing[row.operator.name] = row.unique_stations;
    dateMap.set(row.date, existing);
  }

  const operators = [...operatorSet.values()].sort(
    (a, b) => getOperatorSortIndex(resolveOperatorMnc(null, a.name)) - getOperatorSortIndex(resolveOperatorMnc(null, b.name)),
  );

  const chartData = [...dateMap.values()].sort((a, b) => (a.date as string).localeCompare(b.date as string));

  for (let i = 1; i < chartData.length; i++) {
    for (const op of operators) {
      const cur = chartData[i][op.name] as number | undefined;
      const prev = chartData[i - 1][op.name] as number | undefined;
      if (cur !== undefined && prev !== undefined && prev !== 0) {
        chartData[i][`${op.name}_change`] = ((cur - prev) / prev) * 100;
        chartData[i][`${op.name}_delta`] = cur - prev;
      }
    }
  }

  return { chartData, operators };
}

function useBandCharts(historyData: StatsHistoryRow[] | undefined): BandChartData[] {
  return useMemo(() => {
    if (!historyData?.length) return [];

    const bandGroups = new Map<string, StatsHistoryRow[]>();
    for (const row of historyData) {
      const group = bandGroups.get(row.band.name) ?? [];
      group.push(row);
      bandGroups.set(row.band.name, group);
    }

    return [...bandGroups.entries()].map(([bandName, rows]) => ({
      bandName,
      ...buildChartData(rows),
    }));
  }, [historyData]);
}

function useOperatorChart(stationsData: StatsStationsHistoryRow[] | undefined): ChartData {
  return useMemo(() => {
    if (!stationsData?.length) return { chartData: [], operators: [] };
    return buildChartData(stationsData);
  }, [stationsData]);
}

function HistoryTooltipContent(props: ComponentProps<typeof ChartTooltipContent>) {
  const { locale } = useChart();
  return (
    <ChartTooltipContent
      {...props}
      formatter={(value, name, item) => {
        const change = item.payload[`${name}_change`] as number | undefined;
        const delta = item.payload[`${name}_delta`] as number | undefined;
        return (
          <div className="flex w-full items-center gap-2">
            <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground flex-1">{name}</span>
            <span className="font-mono font-medium tabular-nums">{(value as number).toLocaleString(locale)}</span>
            {change !== null && change !== undefined && delta !== undefined ? (
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  change > 0 ? "text-green-500" : change < 0 ? "text-red-500" : "text-muted-foreground",
                )}
              >
                {change > 0 ? "+" : ""}
                {change.toFixed(2)}% ({delta > 0 ? "+" : ""}
                {delta.toLocaleString(locale)})
              </span>
            ) : null}
          </div>
        );
      }}
    />
  );
}

function HistoryLineChart({
  config,
  data,
  operators,
  locale,
  className,
}: {
  config: ChartConfig;
  data: Record<string, string | number>[];
  operators: ChartOperator[];
  locale: string;
  className?: string;
}) {
  return (
    <ChartContainer config={config} locale={locale} className={cn("aspect-auto w-full", className)}>
      <LineChart accessibilityLayer data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString(locale)} />
        <ChartTooltip content={(props) => <HistoryTooltipContent {...(props as ComponentProps<typeof ChartTooltipContent>)} />} />
        <ChartLegend content={(props) => <ChartLegendContent {...(props as React.ComponentProps<typeof ChartLegendContent>)} />} />
        {operators.map((op) => (
          <Line key={op.name} type="monotone" dataKey={op.name} stroke={op.color} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

function BandHistoryCard({ band, locale }: { band: BandChartData; locale: string }) {
  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(band.operators.map((op) => [op.name, { label: op.name, color: op.color }])),
    [band.operators],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{band.bandName}</CardTitle>
      </CardHeader>
      <CardContent>
        <HistoryLineChart config={config} data={band.chartData} operators={band.operators} locale={locale} className="h-56" />
      </CardContent>
    </Card>
  );
}

function OperatorHistoryCard({
  chartData,
  operators,
  locale,
}: {
  chartData: ChartData["chartData"];
  operators: ChartData["operators"];
  locale: string;
}) {
  const config = useMemo<ChartConfig>(() => Object.fromEntries(operators.map((op) => [op.name, { label: op.name, color: op.color }])), [operators]);

  return (
    <Card>
      <CardContent className="pt-4">
        <HistoryLineChart config={config} data={chartData} operators={operators} locale={locale} className="h-72" />
      </CardContent>
    </Card>
  );
}

export function HistoryChart({ operators }: { operators?: Operator[] }) {
  const { t, i18n } = useTranslation("statistics");
  const [operatorId, setOperatorId] = useState<number | undefined>();
  const [granularity, setGranularity] = useState<"monthly" | "daily">("monthly");
  const [viewMode, setViewMode] = useState<ViewMode>("by-band");

  const { data: historyData, isLoading: bandLoading } = useQuery(statsHistoryQueryOptions({ operator_id: operatorId, granularity }));
  const { data: stationsData, isLoading: stationsLoading } = useQuery(statsStationsHistoryQueryOptions({ operator_id: operatorId, granularity }));
  const isLoading = viewMode === "by-band" ? bandLoading : stationsLoading;
  const bandCharts = useBandCharts(historyData);
  const operatorChart = useOperatorChart(stationsData);

  const operatorItems = useMemo(
    () => [{ value: "all", label: t("filters.allOperators") }, ...(operators?.map((op) => ({ value: String(op.id), label: op.name })) ?? [])],
    [operators, t],
  );

  const granularityItems = useMemo(
    () => [
      { value: "monthly" as const, label: t("filters.monthly") },
      { value: "daily" as const, label: t("filters.daily") },
    ],
    [t],
  );

  const viewItems = useMemo(
    () => [
      { value: "by-band" as const, label: t("filters.byBand") },
      { value: "by-operator" as const, label: t("filters.byOperator") },
    ],
    [t],
  );

  const isEmpty = viewMode === "by-band" ? bandCharts.length === 0 : operatorChart.chartData.length === 0;

  function renderContent() {
    if (isLoading) {
      if (viewMode === "by-band") {
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-56 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        );
      }
      return (
        <Card>
          <CardContent className="pt-4">
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
      );
    }

    if (isEmpty) {
      return (
        <Card>
          <CardContent className="flex items-center justify-center h-56 text-muted-foreground">{t("charts.noHistoryData")}</CardContent>
        </Card>
      );
    }

    if (viewMode === "by-band") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bandCharts.map((band) => (
            <BandHistoryCard key={band.bandName} band={band} locale={i18n.language} />
          ))}
        </div>
      );
    }

    return <OperatorHistoryCard chartData={operatorChart.chartData} operators={operatorChart.operators} locale={i18n.language} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{t("filters.view")}</span>
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} items={viewItems}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="by-band">{t("filters.byBand")}</SelectItem>
                <SelectItem value="by-operator">{t("filters.byOperator")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {viewMode === "by-band" ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">{t("common:labels.operator")}</span>
              <Select
                value={operatorId ? String(operatorId) : "all"}
                onValueChange={(v) => setOperatorId(v === "all" ? undefined : Number(v))}
                items={operatorItems}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filters.allOperators")}</SelectItem>
                  {operators?.map((op) => (
                    <SelectItem key={op.id} value={String(op.id)}>
                      {op.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{t("filters.granularity")}</span>
            <Select value={granularity} onValueChange={(v) => setGranularity(v as "monthly" | "daily")} items={granularityItems}>
              <SelectTrigger className="w-30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t("filters.monthly")}</SelectItem>
                <SelectItem value="daily">{t("filters.daily")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {renderContent()}
    </div>
  );
}
