import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservationEvaluationDetail } from "@openbts/shared/contract";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { evaluationQueryOptions, evaluationsQueryOptions } from "../api/evaluations";
import { MeasurementsPage } from "../components/measurementsPage";
import { listVersions, readShownVersion } from "./evaluationScores";
import { EvaluationSkeleton, NightDetailSkeleton } from "./evaluationSkeleton";
import { GnbLengthsCard } from "./gnbLengthsCard";
import { GroupingCard } from "./groupingCard";
import { NightReportCard } from "./nightReportCard";
import { NightsCard } from "./nightsCard";
import { RadiusCoverageCard } from "./radiusCoverageCard";
import { RatErrorsCard } from "./ratErrorsCard";
import { SnappingCard } from "./snappingCard";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { hasStaleRows } from "@/features/admin/dashboard/cards/dashboardCard";
import { useSettings } from "@/hooks/useSettings";
import { hasFailedLoad } from "@/lib/queryLoadState";

type EvaluationPageProps = {
  nightId: number | undefined;
  onNightChange: (nightId: number | undefined) => void;
};

type NightDetailProps = {
  evaluation: ObservationEvaluationDetail;
  publishedVersion: number | undefined;
};

const NO_NIGHT_ID = 0;

function NightDetail({ evaluation, publishedVersion }: NightDetailProps) {
  const versions = listVersions(evaluation.overall);
  const referenceVersion = readShownVersion(evaluation, publishedVersion);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <NightReportCard key={evaluation.id} evaluation={evaluation} publishedVersion={publishedVersion} />
      <div className="grid items-stretch gap-3 xl:grid-cols-2">
        <RatErrorsCard evaluation={evaluation} versions={versions} referenceVersion={referenceVersion} />
        <RadiusCoverageCard evaluation={evaluation} versions={versions} referenceVersion={referenceVersion} />
        <GroupingCard grouping={evaluation.grouping} />
        <SnappingCard snapping={evaluation.snapping} versions={versions} referenceVersion={referenceVersion} />
      </div>
      {evaluation.gnbLengths.length === 0 ? null : <GnbLengthsCard tests={evaluation.gnbLengths} />}
    </div>
  );
}

function NoEvaluations() {
  const { t } = useTranslation("admin");

  return (
    <ErrorState
      tone="neutral"
      className="min-h-75"
      title={t("measurements.evaluation.empty.title")}
      description={t("measurements.evaluation.empty.description")}
      action={
        <Link to="/admin/measurements" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("measurements.tabs.engine")}
          <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" aria-hidden="true" />
        </Link>
      }
    />
  );
}

export function EvaluationPage({ nightId, onNightChange }: EvaluationPageProps) {
  const nightsQuery = useInfiniteQuery(evaluationsQueryOptions());
  const { data: settings } = useSettings();
  const evaluations = nightsQuery.data?.pages.flatMap((page) => page.data);
  const selectedId = nightId ?? evaluations?.[0]?.id;
  const detailQuery = useQuery({ ...evaluationQueryOptions(selectedId ?? NO_NIGHT_ID), enabled: selectedId !== undefined });
  const publishedVersion = settings?.measurements?.publishedAlgorithmVersion;
  const detail = detailQuery.data;
  const isMissingNight = nightId !== undefined && detail === null;
  const staleQueries = [nightsQuery, detailQuery].filter(hasStaleRows);

  useEffect(() => {
    if (isMissingNight) onNightChange(undefined);
  }, [isMissingNight, onNightChange]);

  function retryDetail() {
    void nightsQuery.refetch();
    void detailQuery.refetch();
  }

  let content = <EvaluationSkeleton />;
  if (evaluations === undefined) {
    if (hasFailedLoad(nightsQuery)) {
      content = <ErrorState className="min-h-75" onRetry={() => nightsQuery.refetch()} isRetrying={nightsQuery.isFetching} />;
    }
  } else if (evaluations.length === 0) {
    content = <NoEvaluations />;
  } else {
    let nightDetail = <NightDetailSkeleton />;
    if (detail !== undefined && detail !== null) {
      nightDetail = <NightDetail evaluation={detail} publishedVersion={publishedVersion} />;
    } else if (hasFailedLoad(detailQuery) || (detail === null && !isMissingNight)) {
      nightDetail = <ErrorState onRetry={retryDetail} isRetrying={detailQuery.isFetching} />;
    }

    content = (
      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <NightsCard
          evaluations={evaluations}
          selectedId={selectedId}
          publishedVersion={publishedVersion}
          hasNextPage={nightsQuery.hasNextPage}
          isFetchingNextPage={nightsQuery.isFetchingNextPage}
          onSelect={onNightChange}
          onShowMore={() => void nightsQuery.fetchNextPage()}
        />
        {nightDetail}
      </div>
    );
  }

  return (
    <MeasurementsPage
      section="evaluation"
      notice={
        staleQueries.length === 0 ? undefined : (
          <StaleDataNotice
            onRetry={() => Promise.all(staleQueries.map((query) => query.refetch()))}
            isRetrying={staleQueries.some((query) => query.isFetching)}
          />
        )
      }
    >
      {content}
    </MeasurementsPage>
  );
}
