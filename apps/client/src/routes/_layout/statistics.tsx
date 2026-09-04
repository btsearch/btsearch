import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, Suspense, lazy, startTransition, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegisterPageSections } from "@/contexts/pageSections";
import { operatorsQueryOptions } from "@/features/shared/queries";
import { InternalKpiCards, UkeKpiCards } from "@/features/statistics/components/kpiCards";
import { statsPermitsQueryOptions, statsSummaryQueryOptions, statsVoivodeshipsQueryOptions } from "@/features/statistics/queries";
import { formatFullDate } from "@/lib/format";
import { buildStaticPageHead } from "@/lib/seo";

const STATS_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SUMMARY_QUERY_KEY = ["stats", "summary", undefined] as const;
const PERMITS_QUERY_KEY = ["stats", "permits", undefined] as const;

const UkeDistributionCharts = lazy(() =>
  import("@/features/statistics/components/distributionCharts").then((m) => ({ default: m.UkeDistributionCharts })),
);
const InternalDistributionCharts = lazy(() =>
  import("@/features/statistics/components/distributionCharts").then((m) => ({ default: m.InternalDistributionCharts })),
);
const UkeBandBarChart = lazy(() => import("@/features/statistics/components/bandBarChart").then((m) => ({ default: m.UkeBandBarChart })));
const InternalBandStationsBarChart = lazy(() =>
  import("@/features/statistics/components/bandBarChart").then((m) => ({ default: m.InternalBandStationsBarChart })),
);
const UkeVoivodeshipChart = lazy(() => import("@/features/statistics/components/voivodeshipChart").then((m) => ({ default: m.UkeVoivodeshipChart })));
const InternalVoivodeshipChart = lazy(() =>
  import("@/features/statistics/components/voivodeshipChart").then((m) => ({ default: m.InternalVoivodeshipChart })),
);
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

function formatRefreshCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function StatisticsRefreshStatus({ label, lastUpdated, queryKey }: { label: string; lastUpdated: string; queryKey: readonly unknown[] }) {
  const { i18n, t } = useTranslation("statistics");
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const nextRefreshAt = Date.parse(lastUpdated) + STATS_REFRESH_INTERVAL_MS;
  const remaining = nextRefreshAt - now;
  const isExpired = remaining <= -1000;

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isExpired) return;
    void queryClient.invalidateQueries({ queryKey, exact: true });
  }, [isExpired, queryClient, queryKey]);

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <HugeiconsIcon icon={Clock01Icon} className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="font-medium text-foreground">{label}</span>
      <span>
        {t("refresh.lastUpdated")} <time dateTime={lastUpdated}>{formatFullDate(lastUpdated, i18n.language)}</time>
      </span>
      <span className="inline-flex items-center gap-2">
        <Separator render={<span />} orientation="vertical" aria-hidden="true" className="h-3 data-vertical:self-center" />
        <span className="tabular-nums">{t("refresh.next", { duration: formatRefreshCountdown(remaining) })}</span>
      </span>
    </p>
  );
}

function StatisticsPage() {
  const { t } = useTranslation("statistics");
  const { data: summaryResponse, isLoading: summaryLoading } = useQuery(statsSummaryQueryOptions());
  const { data: permitsResponse, isLoading: permitsLoading } = useQuery(statsPermitsQueryOptions());
  const { data: voivodeships, isLoading: voivodeshipsLoading } = useQuery(statsVoivodeshipsQueryOptions());
  const { data: operators } = useQuery(operatorsQueryOptions());
  const summary = summaryResponse?.data;
  const permits = permitsResponse?.data;

  useRegisterPageSections([
    { id: "uke-permits", title: t("stationDetails:tabs.permits") },
    { id: "internal-db", title: t("main:stats.internalData") },
    { id: "quality", title: t("sections.quality") },
    { id: "permit-snapshot", title: t("sections.permitSnapshot") },
    { id: "history", title: t("charts.history") },
  ]);

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="w-full space-y-12">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
          {summaryResponse || permitsResponse ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {summaryResponse ? (
                <StatisticsRefreshStatus
                  key={`summary:${summaryResponse.lastUpdated}`}
                  label={t("refresh.summary")}
                  lastUpdated={summaryResponse.lastUpdated}
                  queryKey={SUMMARY_QUERY_KEY}
                />
              ) : null}
              {permitsResponse ? (
                <StatisticsRefreshStatus
                  key={`permits:${permitsResponse.lastUpdated}`}
                  label={t("refresh.ukePermits")}
                  lastUpdated={permitsResponse.lastUpdated}
                  queryKey={PERMITS_QUERY_KEY}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <section id="uke-permits" className="space-y-4">
          <SectionHeader>{t("stationDetails:tabs.permits")}</SectionHeader>
          <UkeKpiCards data={summary} isLoading={summaryLoading} />
          <div className="space-y-4 pt-1">
            <Suspense fallback={distributionSkeleton}>
              <UkeDistributionCharts data={summary} isLoading={summaryLoading} />
            </Suspense>
            <LazyChart fallback={chartSkeleton}>
              <UkeBandBarChart data={permits?.uke} isLoading={permitsLoading} />
            </LazyChart>
            <LazyChart fallback={tallChartSkeleton}>
              <UkeVoivodeshipChart data={voivodeships?.uke} isLoading={voivodeshipsLoading} />
            </LazyChart>
          </div>
        </section>

        <section id="internal-db" className="space-y-4">
          <SectionHeader>{t("main:stats.internalData")}</SectionHeader>
          <InternalKpiCards data={summary} isLoading={summaryLoading} />
          <div className="space-y-4 pt-1">
            <LazyChart fallback={chartSkeleton}>
              <InternalDistributionCharts data={summary} isLoading={summaryLoading} />
            </LazyChart>
            <LazyChart fallback={chartSkeleton}>
              <InternalBandStationsBarChart data={permits?.internal} isLoading={permitsLoading} />
            </LazyChart>
            <LazyChart fallback={tallChartSkeleton}>
              <InternalVoivodeshipChart data={voivodeships?.internal} isLoading={voivodeshipsLoading} />
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
          <SectionHeader>{t("sections.permitSnapshot")}</SectionHeader>
          <LazyChart fallback={chartSkeleton}>
            <PermitsByMonthChart />
          </LazyChart>
        </section>

        <section id="history" className="space-y-4">
          <SectionHeader>{t("charts.history")}</SectionHeader>
          <LazyChart fallback={chartSkeleton}>
            <HistoryChart operators={operators} />
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
