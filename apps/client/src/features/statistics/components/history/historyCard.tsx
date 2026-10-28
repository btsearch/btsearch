import { ChartAverageIcon, ChartHistogramIcon, ChartLineData01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { startTransition, useState } from "react";
import { useTranslation } from "react-i18next";

import type { BandHistory, OperatorPoint, Series } from "../../lib/chartData";
import { listOperators, operatorDataKey, operatorSeries } from "../../lib/operators";
import { type Period, defaultPeriod } from "../../lib/periods";
import { permitHistoryByBandQueryOptions, permitHistoryByOperatorQueryOptions } from "../../queries";
import { STATISTICS_SECTION_IDS } from "../../sections";
import { OperatorLegend } from "../blocks/operatorLegend";
import { CARD_BLOCK_CLASS, DividedGrid, StatisticsCard } from "../card/statisticsCard";
import { type ChartType, StatChart } from "../charts/statChart";
import { IconToggleGroup } from "../controls/iconToggleGroup";
import { PeriodSelects } from "../controls/periodSelects";
import { ToolbarSelect } from "../controls/toolbarSelect";
import { OperatorFilterMenu } from "./operatorFilterMenu";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { toggleValue } from "@/lib/utils";

type ViewMode = "by-band" | "by-operator";
type ChartRow = Record<string, string | number>;
type ChartData = { chartData: ChartRow[]; series: Series[] };
type BandChartData = ChartData & { key: string; bandName: string };

const VIEW_MODES: readonly ViewMode[] = ["by-band", "by-operator"];
const CHART_TYPES: readonly { value: ChartType; icon: IconSvgElement }[] = [
  { value: "area", icon: ChartAverageIcon },
  { value: "line", icon: ChartLineData01Icon },
  { value: "bar", icon: ChartHistogramIcon },
];
const SKELETON_BAND_COUNT = 3;

function keepSelectedOperators(points: readonly OperatorPoint[], operatorIds: readonly number[]): readonly OperatorPoint[] {
  if (operatorIds.length === 0) return points;
  return points.filter((point) => operatorIds.includes(point.operator.id));
}

function buildChartData(points: readonly OperatorPoint[]): ChartData {
  const rowsByDate = new Map<string, ChartRow>();
  for (const point of points) {
    const row = rowsByDate.get(point.date) ?? { date: point.date };
    row[operatorDataKey(point.operator)] = point.value;
    rowsByDate.set(point.date, row);
  }

  const series = operatorSeries(points.map((point) => point.operator));
  const chartData = [...rowsByDate].sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => row);

  for (let index = 1; index < chartData.length; index++) {
    const row = chartData[index];
    const previousRow = chartData[index - 1];
    for (const { key } of series) {
      const value = row[key];
      const previousValue = previousRow[key];
      if (typeof value !== "number" || typeof previousValue !== "number" || previousValue === 0) continue;

      row[`${key}_change`] = ((value - previousValue) / previousValue) * 100;
      row[`${key}_delta`] = value - previousValue;
    }
  }

  return { chartData, series };
}

function listBandCharts(bands: readonly BandHistory[], operatorIds: readonly number[]): BandChartData[] {
  return bands.flatMap((band) => {
    const points = keepSelectedOperators(band.points, operatorIds);
    return points.length === 0 ? [] : [{ key: band.key, bandName: band.name, ...buildChartData(points) }];
  });
}

function HistorySkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "by-operator") {
    return (
      <div aria-hidden="true" className={CARD_BLOCK_CLASS}>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <DividedGrid>
      {Array.from({ length: SKELETON_BAND_COUNT }, (_, index) => (
        <div key={index} aria-hidden="true" className="p-4 sm:px-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-4 h-56 w-full" />
        </div>
      ))}
    </DividedGrid>
  );
}

export function HistoryCard({ countryCode }: { countryCode: string }) {
  const { t } = useTranslation("statistics");
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<number[]>([]);
  const [period, setPeriod] = useState<Period>(() => defaultPeriod("monthly"));
  const [viewMode, setViewMode] = useState<ViewMode>("by-band");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [isolatedId, setIsolatedId] = useState<number | null>(null);
  const bandQuery = useQuery({ ...permitHistoryByBandQueryOptions(countryCode, period), enabled: viewMode === "by-band" });
  const operatorQuery = useQuery({ ...permitHistoryByOperatorQueryOptions(countryCode, period), enabled: viewMode === "by-operator" });
  const activeQuery = viewMode === "by-band" ? bandQuery : operatorQuery;
  const historyPoints = viewMode === "by-band" ? bandQuery.data?.flatMap((band) => band.points) : operatorQuery.data;
  const menuOperators = listOperators((historyPoints ?? []).map((point) => point.operator));
  const selectedIds =
    historyPoints === undefined
      ? selectedOperatorIds
      : selectedOperatorIds.filter((operatorId) => menuOperators.some((operator) => operator.id === operatorId));
  const bandCharts = viewMode === "by-band" ? listBandCharts(bandQuery.data ?? [], selectedIds) : [];
  const operatorChart = buildChartData(viewMode === "by-operator" ? keepSelectedOperators(operatorQuery.data ?? [], selectedIds) : []);
  const legendOperators = selectedIds.length === 0 ? menuOperators : menuOperators.filter((operator) => selectedIds.includes(operator.id));
  const isolatedOperator = legendOperators.find((operator) => operator.id === isolatedId);
  const isolatedKey = isolatedOperator === undefined ? null : operatorDataKey(isolatedOperator);
  const showDots = period.granularity !== "daily";

  const viewItems = VIEW_MODES.map((mode) => ({ value: mode, label: t(mode === "by-band" ? "filters.byBand" : "filters.byOperator") }));
  const chartTypeOptions = CHART_TYPES.map((option) => ({ ...option, label: t(`chartType.${option.value}`) }));
  const isEmpty = viewMode === "by-band" ? bandCharts.length === 0 : operatorChart.chartData.length === 0;

  function changeViewMode(next: unknown) {
    const mode = VIEW_MODES.find((candidate) => candidate === next);
    if (mode !== undefined) startTransition(() => setViewMode(mode));
  }

  function toggleOperator(operatorId: number) {
    const nextIds = toggleValue(selectedIds, operatorId);
    if (isolatedId !== null && nextIds.length > 0 && !nextIds.includes(isolatedId)) setIsolatedId(null);
    startTransition(() => setSelectedOperatorIds(nextIds));
  }

  function isolateSeries(key: string | null) {
    setIsolatedId(legendOperators.find((operator) => operatorDataKey(operator) === key)?.id ?? null);
  }

  function renderContent() {
    if (activeQuery.isLoading) return <HistorySkeleton viewMode={viewMode} />;

    if (activeQuery.isLoadingError) {
      return (
        <div className={CARD_BLOCK_CLASS}>
          <ErrorState onRetry={() => activeQuery.refetch()} isRetrying={activeQuery.isFetching} />
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div className="flex h-56 items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("charts.noHistoryData")}
        </div>
      );
    }

    if (viewMode === "by-operator") {
      return (
        <div className="border-t px-3 pb-3 pt-4 sm:px-4">
          <StatChart
            type={chartType}
            data={operatorChart.chartData}
            series={operatorChart.series}
            dataXKey="date"
            className="h-80"
            showBrush
            showDelta
            connectNulls
            showDots={showDots}
          />
        </div>
      );
    }

    return (
      <>
        <div className="px-4 pb-3 sm:px-5">
          <OperatorLegend operators={legendOperators} selectedId={isolatedOperator?.id ?? null} onSelect={setIsolatedId} />
        </div>
        <DividedGrid>
          {bandCharts.map((band) => (
            <div key={band.key} className="p-4 sm:px-5">
              <h3 className="text-sm leading-5 font-semibold">{band.bandName}</h3>
              <StatChart
                type={chartType}
                data={band.chartData}
                series={band.series}
                dataXKey="date"
                className="mt-3 h-56"
                showBrush
                showDelta
                connectNulls
                showDots={showDots}
                showLegend={false}
                selectedKey={isolatedKey}
                onSelectedKeyChange={isolateSeries}
              />
            </div>
          ))}
        </DividedGrid>
      </>
    );
  }

  return (
    <StatisticsCard
      id={STATISTICS_SECTION_IDS.history}
      title={t("charts.history")}
      actions={
        <>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap xl:items-center">
            <ToolbarSelect
              label={t("filters.view")}
              showLabel
              value={viewMode}
              items={viewItems}
              onValueChange={changeViewMode}
              triggerClassName="sm:w-36"
            />
            <OperatorFilterMenu
              operators={menuOperators}
              selectedIds={selectedIds}
              isLoading={historyPoints === undefined}
              onToggle={toggleOperator}
            />
            <PeriodSelects value={period} onChange={(next) => startTransition(() => setPeriod(next))} showLabels />
          </div>
          <div className="shrink-0 overflow-x-auto">
            <IconToggleGroup label={t("chartType.label")} options={chartTypeOptions} value={chartType} onValueChange={setChartType} />
          </div>
        </>
      }
    >
      {renderContent()}
    </StatisticsCard>
  );
}
