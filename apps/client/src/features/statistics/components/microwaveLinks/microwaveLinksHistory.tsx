import { useQuery } from "@tanstack/react-query";
import { startTransition, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildChartData, keepSelectedOperators } from "../../lib/chartData";
import { toOperatorPoints } from "../../lib/microwaveLinks";
import type { StatisticsOperator } from "../../lib/operators";
import { type Granularity, type Period, defaultPeriod } from "../../lib/periods";
import { microwaveLinkHistoryQueryOptions } from "../../queries";
import { OperatorLegend } from "../blocks/operatorLegend";
import { BlockHeader, EmptyBlock } from "../card/statisticsCard";
import { StatChart } from "../charts/statChart";
import { PeriodSelects } from "../controls/periodSelects";
import { OperatorFilterMenu } from "../history/operatorFilterMenu";
import { useOperatorFilter } from "../history/useOperatorFilter";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type MicrowaveLinksHistoryProps = { countryCode: string; others: StatisticsOperator; startDate: string };

const MONTHLY_ONLY: readonly Granularity[] = ["monthly"];
const CHARTED_MONTHS_MIN = 2;
const ACTIONS_CLASS = "grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center";
const CHART_CLASS = "mt-4 h-80";
const LEGEND_SKELETON_COUNT = 5;

function ChartSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mt-3 -ml-2 flex flex-wrap gap-x-1 gap-y-0.5">
        {Array.from({ length: LEGEND_SKELETON_COUNT }, (_, index) => (
          <span key={index} className="flex h-6 items-center px-2">
            <Skeleton className="h-3 w-18" />
          </span>
        ))}
      </div>
      <Skeleton className={cn("w-full", CHART_CLASS)} />
    </div>
  );
}

export function MicrowaveLinksHistorySkeleton() {
  const { t } = useTranslation("statistics");

  return (
    <div>
      <BlockHeader
        title={t("microwaveLinks.history")}
        actions={
          <div aria-hidden="true" className={ACTIONS_CLASS}>
            <Skeleton className="h-8 sm:w-60" />
            <Skeleton className="h-8 sm:w-44" />
          </div>
        }
      />
      <ChartSkeleton />
    </div>
  );
}

export function MicrowaveLinksHistory({ countryCode, others, startDate }: MicrowaveLinksHistoryProps) {
  const { t } = useTranslation("statistics");
  const [period, setPeriod] = useState<Period>(() => defaultPeriod("monthly"));
  const { data: trend, isLoading, isLoadingError, isFetching, refetch } = useQuery(microwaveLinkHistoryQueryOptions(countryCode, period));
  const points = trend === undefined ? undefined : toOperatorPoints(trend.points, others);
  const { menuOperators, selectedIds, legendOperators, isolatedId, isolatedKey, toggleOperator, isolateOperator, isolateSeries } =
    useOperatorFilter(points);
  const chart = buildChartData(keepSelectedOperators(points ?? [], selectedIds));

  function renderChart() {
    if (isLoading) return <ChartSkeleton />;

    if (isLoadingError) {
      return (
        <div className="mt-4">
          <ErrorState onRetry={() => refetch()} isRetrying={isFetching} />
        </div>
      );
    }

    if (trend === undefined || trend.months.length < CHARTED_MONTHS_MIN) {
      return (
        <div className="mt-4 flex h-56 items-center justify-center">
          <EmptyBlock title={t("microwaveLinks.historyStartsOn", { date: startDate })} description={t("microwaveLinks.historyAfterImport")} />
        </div>
      );
    }

    return (
      <>
        <div className="mt-3">
          <OperatorLegend operators={legendOperators} selectedId={isolatedId} onSelect={isolateOperator} />
        </div>
        <StatChart
          type="line"
          data={chart.chartData}
          series={chart.series}
          dataXKey="date"
          className={CHART_CLASS}
          showBrush
          showDelta
          connectNulls
          showLegend={false}
          selectedKey={isolatedKey}
          onSelectedKeyChange={isolateSeries}
        />
      </>
    );
  }

  return (
    <div>
      <BlockHeader
        title={t("microwaveLinks.history")}
        actions={
          <div className={ACTIONS_CLASS}>
            <OperatorFilterMenu operators={menuOperators} selectedIds={selectedIds} isLoading={points === undefined} onToggle={toggleOperator} />
            <PeriodSelects value={period} onChange={(next) => startTransition(() => setPeriod(next))} granularities={MONTHLY_ONLY} showLabels />
          </div>
        }
      />
      {renderChart()}
    </div>
  );
}
