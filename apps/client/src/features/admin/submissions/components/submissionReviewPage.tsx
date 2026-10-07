import { ArrowLeft01Icon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Submission } from "@openbts/shared/contract";
import { usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type OpenedReview, SubmissionReview } from "./submissionReview";
import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { reviewQueueQueryOptions } from "@/features/admin/submissions/reviewQueue";
import { stationRecordQueryOptions } from "@/features/station-details/station/api";
import { useEditReference } from "@/features/station-editing/data/lookups";
import { submissionPhotosQueryOptions } from "@/features/station-editing/data/submissionPhotos";
import { submissionQueryOptions } from "@/features/station-editing/data/submissions";
import { ApiResponseError, NOT_FOUND_STATUS } from "@/lib/api";

type SubmissionReviewPageProps = {
  submissionId: string;
};

type BackToSubmissionsButtonProps = {
  variant: "default" | "outline";
};

type SubmissionPreloadProps = {
  submission: Submission;
};

type ReadState = "ready" | "loading" | "failed";

type ReadProgress = {
  data: unknown;
  dataUpdatedAt: number;
  isError: boolean;
  isFetching: boolean;
};

type Opening = {
  turn: number;
  startedAt: number;
};

const NO_STATION_ID = 0;
const INVALID_REQUEST_STATUS = 400;
const SKELETON_PILLS = [0, 1, 2, 3];

function getReadState(read: ReadProgress, startedAt: number): ReadState {
  if (read.data !== undefined && read.dataUpdatedAt >= startedAt) return "ready";
  return read.isError && !read.isFetching ? "failed" : "loading";
}

function isMissingSubmission(error: unknown): boolean {
  return error instanceof ApiResponseError && (error.status === NOT_FOUND_STATUS || error.status === INVALID_REQUEST_STATUS);
}

function BackToSubmissionsButton({ variant }: BackToSubmissionsButtonProps) {
  const { t } = useTranslation("common");

  return (
    <Button variant={variant} nativeButton={false} render={<Link to="/admin/submissions" search={{ page: 0, q: undefined }} />}>
      <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
      {t("actions.back")}
    </Button>
  );
}

function SubmissionPreload({ submission }: SubmissionPreloadProps) {
  usePrefetchQuery(reviewQueueQueryOptions(submission));
  usePrefetchQuery(submissionPhotosQueryOptions(submission.id));

  return null;
}

function ReviewSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b bg-background">
        <div className="px-4 py-2">
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
        <div className="space-y-1.5 border-t border-border/50 px-4 py-2.5">
          <Skeleton className="h-6 w-72 max-w-full rounded-md" />
          <Skeleton className="h-4 w-96 max-w-full rounded-md" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-0 flex-[2_0_364px] space-y-2 max-md:flex-[1_1_auto]">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
          <div className="min-w-0 flex-[5_0_500px] space-y-2 max-md:flex-[1_1_auto]">
            <div className="flex flex-wrap gap-1">
              {SKELETON_PILLS.map((pill) => (
                <Skeleton key={pill} className="h-7 w-14 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-52 w-full rounded-xl" />
            <Skeleton className="h-52 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SubmissionReviewPage({ submissionId }: SubmissionReviewPageProps) {
  const { t } = useTranslation(["submissions", "stationDetails", "common"]);
  const [opening, setOpening] = useState<Opening>(() => ({ turn: 0, startedAt: Date.now() }));
  const [opened, setOpened] = useState<OpenedReview | null>(null);
  const submissionQuery = useQuery({ ...submissionQueryOptions(submissionId), staleTime: 0, refetchOnMount: "always" });
  const submission = submissionQuery.data;
  const stationId = submission?.stationId ?? null;
  const stationQuery = useQuery({
    ...stationRecordQueryOptions(stationId ?? NO_STATION_ID),
    enabled: stationId !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });
  useEditReference();

  const { refetch: refetchSubmission } = submissionQuery;
  const { refetch: refetchStation } = stationQuery;
  const station = stationId === null ? null : (stationQuery.data ?? null);
  const submissionState = getReadState(submissionQuery, opening.startedAt);
  const stationState = stationId === null ? "ready" : getReadState(stationQuery, opening.startedAt);
  const isCurrentOpening = opened !== null && opened.turn === opening.turn;

  if (!isCurrentOpening && submission !== undefined && submissionState === "ready" && stationState === "ready") {
    setOpened({ turn: opening.turn, submission, station });
  }

  function reload() {
    const startedAt = Date.now();
    setOpening((known) => ({ turn: known.turn + 1, startedAt }));
    void refetchSubmission();
    if (stationId !== null) void refetchStation();
  }

  if (isCurrentOpening && submission !== undefined) {
    return <SubmissionReview key={opened.turn} opened={opened} submission={submission} station={station} onReload={reload} />;
  }

  if (submissionState === "failed") {
    return isMissingSubmission(submissionQuery.error) ? (
      <PageErrorState
        tone="neutral"
        icon={SearchRemoveIcon}
        title={t("detail.notFoundTitle")}
        description={t("detail.notFoundDescription")}
        action={<BackToSubmissionsButton variant="default" />}
      />
    ) : (
      <PageErrorState
        onRetry={() => refetchSubmission()}
        isRetrying={submissionQuery.isFetching}
        action={<BackToSubmissionsButton variant="outline" />}
      />
    );
  }

  if (submissionState === "ready" && stationState === "failed") {
    return (
      <PageErrorState
        title={t("stationDetails:page.stationUnavailableTitle")}
        description={t("common:error.tryLater")}
        onRetry={() => refetchStation()}
        isRetrying={stationQuery.isFetching}
        action={<BackToSubmissionsButton variant="outline" />}
      />
    );
  }

  return (
    <>
      {submission === undefined ? null : <SubmissionPreload submission={submission} />}
      <ReviewSkeleton />
    </>
  );
}
