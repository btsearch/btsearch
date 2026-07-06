import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Operator } from "@/types/station";

import type { StatsHistoryRow, StatsOperator, StatsStationsHistoryRow } from "../api";
import { compareBandNames } from "../lib/bandOrder";
import { operatorDataKey, operatorSeries } from "../lib/series";
import { statsHistoryQueryOptions, statsStationsHistoryQueryOptions } from "../queries";
import type { ChartType } from "./chartTypeContext";
import { ChartTypeToggle } from "./chartTypeToggle";
import type { Series } from "./statChart";
import { StatChartCard } from "./statChartCard";

type ViewMode = "by-band" | "by-operator";

interface ChartData {
  chartData: Record<string, string | number>[];
  series: Series[];
}

interface BandChartData extends ChartData {
  bandName: string;
}

function buildChartData(rows: { date: string; operator: StatsOperator; unique_stations: number }[]): ChartData {
  const dateMap = new Map<string, Record<string, string | number>>();
  const operatorSet = new Map<number, StatsOperator>();

  for (const row of rows) {
    if (!operatorSet.has(row.operator.id)) operatorSet.set(row.operator.id, row.operator);
    const existing = dateMap.get(row.date) ?? { date: row.date };
    existing[operatorDataKey(row.operator)] = row.unique_stations;
    dateMap.set(row.date, existing);
  }

  const series = operatorSeries(operatorSet.values());

  const chartData = [...dateMap.values()].sort((a, b) => (a.date as string).localeCompare(b.date as string));

  for (let i = 1; i < chartData.length; i++) {
    for (const op of series) {
      const cur = chartData[i][op.key] as number | undefined;
      const prev = chartData[i - 1][op.key] as number | undefined;
      if (cur !== undefined && prev !== undefined && prev !== 0) {
        chartData[i][`${op.key}_change`] = ((cur - prev) / prev) * 100;
        chartData[i][`${op.key}_delta`] = cur - prev;
      }
    }
  }

  return { chartData, series };
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

    return [...bandGroups.entries()]
      .map(([bandName, rows]) => ({
        bandName,
        ...buildChartData(rows),
      }))
      .sort((a, b) => compareBandNames(a.bandName, b.bandName));
  }, [historyData]);
}

function useOperatorChart(stationsData: StatsStationsHistoryRow[] | undefined): ChartData {
  return useMemo(() => {
    if (!stationsData?.length) return { chartData: [], series: [] };
    return buildChartData(stationsData);
  }, [stationsData]);
}

function BandHistoryCard({ band, chartType, granularity }: { band: BandChartData; chartType: ChartType; granularity: "monthly" | "daily" }) {
  const isDaily = granularity === "daily";

  return (
    <StatChartCard
      title={band.bandName}
      data={band.chartData}
      series={band.series}
      dataXKey="date"
      height="h-56"
      minWidth="min-w-0"
      showBrush
      showDelta
      connectNulls
      showDots={!isDaily}
      type={chartType}
    />
  );
}

function OperatorHistoryCard({
  chartData,
  series,
  chartType,
  granularity,
}: {
  chartData: ChartData["chartData"];
  series: ChartData["series"];
  chartType: ChartType;
  granularity: "monthly" | "daily";
}) {
  const { t } = useTranslation("statistics");
  const isDaily = granularity === "daily";

  return (
    <StatChartCard
      title={t("charts.history")}
      data={chartData}
      series={series}
      dataXKey="date"
      height="h-80"
      minWidth="min-w-[760px]"
      showBrush
      showDelta
      connectNulls
      showDots={!isDaily}
      type={chartType}
    />
  );
}

export function HistoryChart({ operators }: { operators?: Operator[] }) {
  const { t } = useTranslation("statistics");
  const { t: tCommon } = useTranslation("common");
  const [operatorId, setOperatorId] = useState<number | undefined>();
  const [granularity, setGranularity] = useState<"monthly" | "daily">("monthly");
  const [viewMode, setViewMode] = useState<ViewMode>("by-band");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [, startTransition] = useTransition();

  const { data: historyData, isLoading: bandLoading } = useQuery({
    ...statsHistoryQueryOptions({ operator_id: operatorId, granularity }),
    enabled: viewMode === "by-band",
  });
  const { data: stationsData, isLoading: stationsLoading } = useQuery({
    ...statsStationsHistoryQueryOptions({ operator_id: operatorId, granularity }),
    enabled: viewMode === "by-operator",
  });
  const isLoading = viewMode === "by-band" ? bandLoading : stationsLoading;
  const bandCharts = useBandCharts(viewMode === "by-band" ? historyData : undefined);
  const operatorChart = useOperatorChart(viewMode === "by-operator" ? stationsData : undefined);

  const operatorItems = useMemo(
    () => [{ value: "all", label: tCommon("labels.allOperators") }, ...(operators?.map((op) => ({ value: String(op.id), label: op.name })) ?? [])],
    [operators, tCommon],
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="relative border border-border">
                <div className="border-b border-border px-4 py-3">
                  <Skeleton className="h-3.5 w-24" />
                </div>
                <div className="px-4 py-4">
                  <Skeleton className="h-56 w-full" />
                </div>
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className="relative border border-border">
          <div className="px-4 py-4">
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div className="relative border border-border">
          <div className="flex h-56 items-center justify-center text-muted-foreground text-sm">{t("charts.noHistoryData")}</div>
        </div>
      );
    }

    if (viewMode === "by-band")
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {bandCharts.map((band) => (
            <BandHistoryCard key={band.bandName} band={band} chartType={chartType} granularity={granularity} />
          ))}
        </div>
      );

    return <OperatorHistoryCard chartData={operatorChart.chartData} series={operatorChart.series} chartType={chartType} granularity={granularity} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border border-border p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="w-20 shrink-0 text-sm text-muted-foreground sm:w-auto">{t("filters.view")}</span>
            <Select value={viewMode} onValueChange={(v) => startTransition(() => setViewMode(v as ViewMode))} items={viewItems}>
              <SelectTrigger className="h-8 min-w-0 flex-1 sm:w-36 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="by-band">{t("filters.byBand")}</SelectItem>
                <SelectItem value="by-operator">{t("filters.byOperator")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {viewMode === "by-band" ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="w-20 shrink-0 text-sm text-muted-foreground sm:w-auto">{t("common:labels.operator")}</span>
              <Select
                value={operatorId ? String(operatorId) : "all"}
                onValueChange={(v) => startTransition(() => setOperatorId(v === "all" ? undefined : Number(v)))}
                items={operatorItems}
              >
                <SelectTrigger className="h-8 min-w-0 flex-1 sm:w-44 sm:flex-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tCommon("labels.allOperators")}</SelectItem>
                  {operators?.map((op) => (
                    <SelectItem key={op.id} value={String(op.id)}>
                      {op.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="w-20 shrink-0 text-sm text-muted-foreground sm:w-auto">{t("filters.granularity")}</span>
            <Select
              value={granularity}
              onValueChange={(v) => startTransition(() => setGranularity(v as "monthly" | "daily"))}
              items={granularityItems}
            >
              <SelectTrigger className="h-8 min-w-0 flex-1 sm:w-30 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t("filters.monthly")}</SelectItem>
                <SelectItem value="daily">{t("filters.daily")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="shrink-0 overflow-x-auto">
          <ChartTypeToggle value={chartType} onValueChange={setChartType} />
        </div>
      </div>

      {renderContent()}
    </div>
  );
}
