import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, Suspense, lazy, startTransition, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { StaleDataNotice } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegisterPageSections } from "@/contexts/pageSections";
import { countriesQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { InternalKpiCards, RegisterKpiCards } from "@/features/statistics/components/kpiCards";
import { listRegisterOperators } from "@/features/statistics/lib/register";
import {
  statisticsByBandQueryOptions,
  statisticsByRegionQueryOptions,
  statisticsSummaryQueryOptions,
  useRegisterSourceName,
} from "@/features/statistics/queries";
import { buildStaticPageHead } from "@/lib/seo";

const RegisterDistributionCharts = lazy(() =>
  import("@/features/statistics/components/distributionCharts").then((m) => ({ default: m.RegisterDistributionCharts })),
);
const InternalDistributionCharts = lazy(() =>
  import("@/features/statistics/components/distributionCharts").then((m) => ({ default: m.InternalDistributionCharts })),
);
const RegisterBandBarChart = lazy(() => import("@/features/statistics/components/bandBarChart").then((m) => ({ default: m.RegisterBandBarChart })));
const InternalBandStationsBarChart = lazy(() =>
  import("@/features/statistics/components/bandBarChart").then((m) => ({ default: m.InternalBandStationsBarChart })),
);
const RegisterRegionChart = lazy(() => import("@/features/statistics/components/regionChart").then((m) => ({ default: m.RegisterRegionChart })));
const InternalRegionChart = lazy(() => import("@/features/statistics/components/regionChart").then((m) => ({ default: m.InternalRegionChart })));
const HistoryChart = lazy(() => import("@/features/statistics/components/historyChart").then((m) => ({ default: m.HistoryChart })));
const CompletenessCharts = lazy(() => import("@/features/statistics/components/completenessCharts").then((m) => ({ default: m.CompletenessCharts })));
const ContributionsChart = lazy(() => import("@/features/statistics/components/contributionsChart").then((m) => ({ default: m.ContributionsChart })));
const AnalyzerUsageChart = lazy(() => import("@/features/statistics/components/analyzerUsageChart").then((m) => ({ default: m.AnalyzerUsageChart })));
const PermitsByMonthChart = lazy(() =>
  import("@/features/statistics/components/permitsByMonthChart").then((m) => ({ default: m.PermitsByMonthChart })),
);

function ChartPanelSkeleton({ contentClassName, noBorder = false }: { contentClassName?: string; noBorder?: boolean }) {
  const inner = (
    <>
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="px-4 py-4">
        <Skeleton className={contentClassName ?? "h-96 w-full"} />
      </div>
    </>
  );

  if (noBorder) return <div>{inner}</div>;

  return <div className="relative border border-border">{inner}</div>;
}

function DistributionSkeleton() {
  return (
    <div className="relative border border-border">
      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        <ChartPanelSkeleton contentClassName="h-64 w-full" noBorder />
        <ChartPanelSkeleton contentClassName="h-64 w-full" noBorder />
      </div>
    </div>
  );
}

const chartSkeleton = <ChartPanelSkeleton />;
const tallChartSkeleton = <ChartPanelSkeleton contentClassName="h-140 w-full" />;
const distributionSkeleton = <DistributionSkeleton />;

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</h2>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

function LazyChart({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          const reveal = () => startTransition(() => setVisible(true));
          if (typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(reveal, { timeout: 300 });
          } else {
            reveal();
          }
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {visible ? (
        <Suspense fallback={fallback}>
          <div className="chart-enter">{children}</div>
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}

type ChartQuery = { data: unknown; isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };

function getChartQueryState(query: ChartQuery) {
  return { isLoading: query.isLoading, isError: query.isError && query.data === undefined, onRetry: query.refetch, isRetrying: query.isFetching };
}

function StatisticsPage() {
  const { t } = useTranslation("statistics");
  const summaryQuery = useQuery(statisticsSummaryQueryOptions());
  const bandsQuery = useQuery(statisticsByBandQueryOptions());
  const regionsQuery = useQuery(statisticsByRegionQueryOptions());
  const { data: operators } = useQuery(operatorsQueryOptions());
  const { data: countries } = useQuery(countriesQueryOptions());
  const sourceName = useRegisterSourceName();
  const snapshotTitle = sourceName === null ? t("sections.registerSnapshot") : t("sections.permitSnapshot", { source: sourceName });

  useRegisterPageSections([
    { id: "uke-permits", title: t("common:labels.permitRegister") },
    { id: "internal-db", title: t("main:stats.internalData") },
    { id: "quality", title: t("sections.quality") },
    { id: "permit-snapshot", title: snapshotTitle },
    { id: "history", title: t("charts.history") },
  ]);

  const summary = summaryQuery.data;
  const bands = bandsQuery.data;
  const regions = regionsQuery.data;
  const summaryState = getChartQueryState(summaryQuery);
  const bandsState = getChartQueryState(bandsQuery);
  const regionsState = getChartQueryState(regionsQuery);
  const staleQueries = [summaryQuery, bandsQuery, regionsQuery].filter((query) => query.isRefetchError);
  const registerOperators = operators === undefined || countries === undefined ? undefined : listRegisterOperators(operators, countries);

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="w-full space-y-12">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("nav:items.statistics")}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
          {staleQueries.length > 0 ? (
            <StaleDataNotice
              className="mt-3"
              onRetry={() => Promise.all(staleQueries.map((query) => query.refetch()))}
              isRetrying={staleQueries.some((query) => query.isFetching)}
            />
          ) : null}
        </div>

        <section id="uke-permits" className="space-y-4">
          <SectionHeader>{t("common:labels.permitRegister")}</SectionHeader>
          <RegisterKpiCards data={summary?.register} {...summaryState} />
          <div className="space-y-4 pt-1">
            <Suspense fallback={distributionSkeleton}>
              <RegisterDistributionCharts data={summary?.register} {...summaryState} />
            </Suspense>
            <LazyChart fallback={chartSkeleton}>
              <RegisterBandBarChart data={bands?.register} {...bandsState} />
            </LazyChart>
            <LazyChart fallback={tallChartSkeleton}>
              <RegisterRegionChart data={regions?.register} {...regionsState} />
            </LazyChart>
          </div>
        </section>

        <section id="internal-db" className="space-y-4">
          <SectionHeader>{t("main:stats.internalData")}</SectionHeader>
          <InternalKpiCards data={summary?.database} {...summaryState} />
          <div className="space-y-4 pt-1">
            <LazyChart fallback={chartSkeleton}>
              <InternalDistributionCharts data={summary?.database} {...summaryState} />
            </LazyChart>
            <LazyChart fallback={chartSkeleton}>
              <InternalBandStationsBarChart data={bands?.database} {...bandsState} />
            </LazyChart>
            <LazyChart fallback={tallChartSkeleton}>
              <InternalRegionChart data={regions?.database} {...regionsState} />
            </LazyChart>
          </div>
        </section>

        <section id="quality" className="space-y-4">
          <SectionHeader>{t("sections.quality")}</SectionHeader>
          <LazyChart fallback={distributionSkeleton}>
            <CompletenessCharts />
          </LazyChart>
          <LazyChart fallback={chartSkeleton}>
            <ContributionsChart />
          </LazyChart>
          <LazyChart fallback={chartSkeleton}>
            <AnalyzerUsageChart />
          </LazyChart>
        </section>

        <section id="permit-snapshot" className="space-y-4">
          <SectionHeader>{snapshotTitle}</SectionHeader>
          <LazyChart fallback={chartSkeleton}>
            <PermitsByMonthChart />
          </LazyChart>
        </section>

        <section id="history" className="space-y-4">
          <SectionHeader>{t("charts.history")}</SectionHeader>
          <LazyChart fallback={chartSkeleton}>
            <HistoryChart operators={registerOperators} />
          </LazyChart>
        </section>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/statistics")({
  component: StatisticsPage,
  head: () => buildStaticPageHead("/statistics"),
  staticData: {
    titleKey: "items.statistics",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
