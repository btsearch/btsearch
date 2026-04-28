import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, Suspense, lazy, startTransition, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegisterPageSections } from "@/contexts/pageSections";
import { operatorsQueryOptions } from "@/features/shared/queries";
import { InternalKpiCards, UkeKpiCards } from "@/features/statistics/components/kpiCards";
import { statsPermitsQueryOptions, statsSummaryQueryOptions, statsVoivodeshipsQueryOptions } from "@/features/statistics/queries";

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
const InternalBandBarChart = lazy(() => import("@/features/statistics/components/bandBarChart").then((m) => ({ default: m.InternalBandBarChart })));
const UkeVoivodeshipChart = lazy(() => import("@/features/statistics/components/voivodeshipChart").then((m) => ({ default: m.UkeVoivodeshipChart })));
const InternalVoivodeshipChart = lazy(() =>
  import("@/features/statistics/components/voivodeshipChart").then((m) => ({ default: m.InternalVoivodeshipChart })),
);
const InternalOperatorStationsChart = lazy(() =>
  import("@/features/statistics/components/operatorStationsChart").then((m) => ({ default: m.InternalOperatorStationsChart })),
);
const HistoryChart = lazy(() => import("@/features/statistics/components/historyChart").then((m) => ({ default: m.HistoryChart })));

function ChartCardSkeleton({ contentClassName }: { contentClassName?: string }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className={contentClassName ?? "h-96 w-full"} />
      </CardContent>
    </Card>
  );
}

function DistributionSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ChartCardSkeleton contentClassName="h-64 w-full" />
      <ChartCardSkeleton contentClassName="h-64 w-full" />
    </div>
  );
}

const chartSkeleton = <ChartCardSkeleton />;
const tallChartSkeleton = <ChartCardSkeleton contentClassName="h-140 w-full" />;
const distributionSkeleton = <DistributionSkeleton />;

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-5 w-0.5 rounded-full bg-primary shrink-0" />
      <h2 className="text-base font-semibold">{children}</h2>
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
          if (typeof requestIdleCallback !== "undefined") requestIdleCallback(() => startTransition(() => setVisible(true)), { timeout: 2000 });
          else startTransition(() => setVisible(true));
        }
      },
      { rootMargin: "80px" },
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

function StatisticsPage() {
  const { t } = useTranslation("statistics");
  const { data: summary, isLoading: summaryLoading } = useQuery(statsSummaryQueryOptions());
  const { data: permits, isLoading: permitsLoading } = useQuery(statsPermitsQueryOptions());
  const { data: voivodeships, isLoading: voivodeshipsLoading } = useQuery(statsVoivodeshipsQueryOptions());
  const { data: operators } = useQuery(operatorsQueryOptions());

  useRegisterPageSections([
    { id: "uke-permits", title: t("stationDetails:tabs.permits") },
    { id: "internal-db", title: t("main:stats.internalData") },
    { id: "history", title: t("charts.history") },
  ]);

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="space-y-12">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>

        <section id="uke-permits" className="space-y-6">
          <div className="space-y-4">
            <SectionHeader>{t("stationDetails:tabs.permits")}</SectionHeader>
            <UkeKpiCards data={summary} isLoading={summaryLoading} />
          </div>
          <Suspense fallback={distributionSkeleton}>
            <UkeDistributionCharts data={summary} isLoading={summaryLoading} />
          </Suspense>
          <LazyChart fallback={chartSkeleton}>
            <UkeBandBarChart data={permits?.uke} isLoading={permitsLoading} />
          </LazyChart>
          <LazyChart fallback={tallChartSkeleton}>
            <UkeVoivodeshipChart data={voivodeships?.uke} isLoading={voivodeshipsLoading} />
          </LazyChart>
        </section>

        <hr className="border-border" />

        <section id="internal-db" className="space-y-6">
          <div className="space-y-4">
            <SectionHeader>{t("main:stats.internalData")}</SectionHeader>
            <InternalKpiCards data={summary} isLoading={summaryLoading} />
          </div>
          <LazyChart fallback={chartSkeleton}>
            <InternalOperatorStationsChart data={summary} isLoading={summaryLoading} />
          </LazyChart>
          <LazyChart fallback={distributionSkeleton}>
            <InternalDistributionCharts data={summary} isLoading={summaryLoading} />
          </LazyChart>
          <LazyChart fallback={chartSkeleton}>
            <InternalBandStationsBarChart data={permits?.internal} isLoading={permitsLoading} />
          </LazyChart>
          <LazyChart fallback={chartSkeleton}>
            <InternalBandBarChart data={permits?.internal} isLoading={permitsLoading} />
          </LazyChart>
          <LazyChart fallback={tallChartSkeleton}>
            <InternalVoivodeshipChart data={voivodeships?.internal} isLoading={voivodeshipsLoading} />
          </LazyChart>
        </section>

        <hr className="border-border" />

        <section id="history" className="space-y-6">
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
  staticData: {
    titleKey: "items.statistics",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
