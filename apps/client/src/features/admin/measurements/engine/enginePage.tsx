import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { engineStateQueryOptions } from "../api/engine";
import { MeasurementsPage } from "../components/measurementsPage";
import { EngineRunsCard } from "./engineRunsCard";
import { EngineStatusCard, LastDayCard, QueueCard, StorageCard } from "./engineStatusCards";
import { LatestErrorsCard } from "./latestErrorsCard";
import { NightlyRunsCard } from "./nightlyRunsCard";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CardLoading, hasStaleRows } from "@/features/admin/dashboard/cards/dashboardCard";
import { useNow } from "@/hooks/useNow";
import { hasFailedLoad } from "@/lib/queryLoadState";
import { cn } from "@/lib/utils";

const GRID_CLASS = "grid gap-3 @3xl:grid-cols-2 @5xl:grid-cols-3";

const SKELETON_CARDS = [
  { id: "status", title: "w-16", lines: ["h-3.5 w-full", "h-3.5 w-4/5", "h-3.5 w-[90%]"] },
  { id: "queue", title: "w-18", lines: ["h-3.5 w-full", "h-3.5 w-[70%]", "h-3.5 w-[85%]", "h-3.5 w-3/5"] },
  { id: "lastDay", title: "w-30", lines: ["h-3.5 w-full", "h-3.5 w-3/4"] },
  { id: "storage", title: "w-24", lines: ["h-1 w-full", "h-1 w-full", "h-3.5 w-[70%]"] },
  { id: "nightly", title: "w-26", lines: ["h-3.5 w-full", "h-3.5 w-[90%]"] },
  { id: "errors", title: "w-22", lines: ["h-3.5 w-full", "h-3.5 w-[65%]", "h-3.5 w-4/5"] },
] as const;

function EngineSkeleton() {
  return (
    <CardLoading className={GRID_CLASS}>
      {SKELETON_CARDS.map((card) => (
        <div key={card.id} aria-hidden="true" className="overflow-hidden rounded-xl border bg-card">
          <div className="flex min-h-[41px] items-center border-b bg-muted/50 px-4 py-2.5">
            <Skeleton className={cn("h-3.5", card.title)} />
          </div>
          <div className="grid gap-3.5 px-4 pt-3.5 pb-4.5">
            {card.lines.map((line, index) => (
              <Skeleton key={index} className={line} />
            ))}
          </div>
        </div>
      ))}
    </CardLoading>
  );
}

export function EnginePage() {
  const { t } = useTranslation("admin");
  const engineQuery = useQuery(engineStateQueryOptions());
  const now = Math.max(useNow(), engineQuery.dataUpdatedAt);
  const state = engineQuery.data;
  const retry = () => engineQuery.refetch();

  let content: ReactNode;
  if (state !== undefined) {
    content = (
      <div className={GRID_CLASS}>
        <EngineStatusCard instances={state.instances} now={now} />
        <QueueCard state={state} now={now} />
        <LastDayCard uploads={state.uploads} />
        <StorageCard state={state} />
        <NightlyRunsCard runs={state.nightlyRuns} />
        <LatestErrorsCard errors={state.latestErrors} now={now} />
        <EngineRunsCard runs={state.recentRuns} now={now} />
      </div>
    );
  } else if (hasFailedLoad(engineQuery)) {
    content = <ErrorState title={t("measurements.engine.loadFailed")} onRetry={retry} isRetrying={engineQuery.isFetching} />;
  } else {
    content = <EngineSkeleton />;
  }

  return (
    <MeasurementsPage
      section="engine"
      notice={hasStaleRows(engineQuery) ? <StaleDataNotice onRetry={retry} isRetrying={engineQuery.isFetching} /> : null}
    >
      <div className="@container">{content}</div>
    </MeasurementsPage>
  );
}
