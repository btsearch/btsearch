import { AlertCircleIcon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ImportRun, ImportRunDetail, OfficialSource } from "@openbts/shared/contract";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  cancelImportRun,
  importHistoryQueryOptions,
  importKeys,
  importOverviewQueryOptions,
  importRunQueryOptions,
  startImportRun,
  useIsSourceImporting,
} from "@/features/admin/official-import/api";
import { RunResults } from "@/features/admin/official-import/RunResults";
import {
  type DatasetSelectionOverrides,
  type ImportOverview,
  type RunOutcome,
  type StepStatus,
  buildStartRunBody,
  getCachedFormatter,
  getDatasetLabel,
  getImportSchedule,
  getRunDurationMs,
  getRunOutcome,
  getRunSourceLabel,
  getSelectedDatasetIds,
  groupImportRunsByDay,
  isFailureOutcome,
  isRunLive,
  listPreviousRuns,
} from "@/features/admin/official-import/runs";
import { StepStatusIcon } from "@/features/admin/official-import/StepStatusIcon";
import { officialSourcesQueryOptions } from "@/features/official/queries";
import { showApiError } from "@/lib/api";
import { formatDuration, formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const OUTCOME_ICON_STATUS: Record<Exclude<RunOutcome, "completedWithErrors">, StepStatus> = {
  queued: "pending",
  running: "running",
  success: "success",
  held: "held",
  error: "error",
  cancelled: "skipped",
};

const NON_BREAKING_SPACE = "\u00A0";

const freshOfficialSourcesQueryOptions = { ...officialSourcesQueryOptions(), refetchOnMount: "always" as const };

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function formatRunDuration(run: ImportRun): string | null {
  const elapsed = getRunDurationMs(run);
  return elapsed === null ? null : formatDuration(elapsed);
}

function formatImportTime(date: string, locale: string): string {
  return getCachedFormatter(timeFormatters, locale, () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" })).format(
    new Date(date),
  );
}

function getOutcomeTextClass(outcome: RunOutcome): string {
  if (isFailureOutcome(outcome)) return "text-destructive";
  return outcome === "held" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";
}

function RunOutcomeIcon({ outcome, className }: { outcome: RunOutcome; className?: string }) {
  if (outcome === "completedWithErrors") {
    return <HugeiconsIcon icon={AlertCircleIcon} className={cn("shrink-0 text-destructive", className)} aria-hidden="true" />;
  }
  return <StepStatusIcon status={OUTCOME_ICON_STATUS[outcome]} className={className} />;
}

function PanelHeader({ id, title, description, children }: { id: string; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold leading-none">
          {title}
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums">{children}</dd>
    </div>
  );
}

function useRunTags(run: ImportRun): string[] {
  const { t } = useTranslation("admin");
  const { data: sourceLabel = null } = useQuery({
    ...officialSourcesQueryOptions(),
    select: (sources) => getRunSourceLabel(sources, run.sourceKey),
  });
  const tags: string[] = [];
  if (sourceLabel !== null) tags.push(sourceLabel);
  if (run.kind !== "import") tags.push(t(`officialImport.kind.${run.kind}`));
  if (run.isDryRun) tags.push(t("officialImport.dryRun.label"));
  return tags;
}

function RunTagBadges({ tags }: { tags: readonly string[] }) {
  return (
    <>
      {tags.map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
    </>
  );
}

function CancelRunButton({ runId }: { runId: string }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const cancelMutation = useMutation({
    mutationFn: () => cancelImportRun(runId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importKeys.overview() }),
    onError: showApiError,
  });

  return (
    <Button variant="outline" size="sm" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
      {cancelMutation.isPending ? <Spinner className="size-3.5" /> : null}
      {t("officialImport.cancel")}
    </Button>
  );
}

function ImportRunDetails({ run, children }: { run: ImportRun; children: ReactNode }) {
  const { t, i18n } = useTranslation("admin");
  const duration = formatRunDuration(run);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {run.startedAt ? (
            <DetailItem label={t("officialImport.startedAt")}>{formatFullDate(run.startedAt, i18n.language)}</DetailItem>
          ) : (
            <DetailItem label={t("officialImport.queuedAt")}>{formatFullDate(run.createdAt, i18n.language)}</DetailItem>
          )}
          {run.finishedAt ? <DetailItem label={t("officialImport.finishedAt")}>{formatFullDate(run.finishedAt, i18n.language)}</DetailItem> : null}
          {duration ? <DetailItem label={t("officialImport.duration")}>{duration}</DetailItem> : null}
          <DetailItem label={t("officialImport.trigger.label")}>{t(`officialImport.trigger.${run.trigger}`)}</DetailItem>
        </dl>
        {isRunLive(run) ? <CancelRunButton runId={run.id} /> : null}
      </div>

      {run.error ? (
        <InlineError title={t("officialImport.failure.job")} description={<span className="whitespace-pre-wrap wrap-break-word">{run.error}</span>} />
      ) : null}

      {children}
    </div>
  );
}

function RunResultsSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-8" />
      ))}
    </div>
  );
}

type LatestImportProps = {
  overview: ImportOverview | undefined;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => unknown;
};

function LatestImportBody({ overview, isError, isRetrying, onRetry }: LatestImportProps) {
  const { t } = useTranslation("admin");

  if (overview?.latest) {
    return (
      <ImportRunDetails run={overview.latest}>
        <RunResults run={overview.latest} />
      </ImportRunDetails>
    );
  }
  if (overview) return <p className="text-sm text-muted-foreground">{t("officialImport.latest.empty")}</p>;
  if (isError) return <ErrorState title={t("officialImport.latest.loadError")} onRetry={onRetry} isRetrying={isRetrying} />;

  return (
    <div role="status" aria-label={t("officialImport.latest.loading")} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </div>
      <RunResultsSkeleton />
    </div>
  );
}

function useScheduleDescription(): string {
  const { t } = useTranslation("admin");
  const { data: schedule } = useQuery({ ...freshOfficialSourcesQueryOptions, select: getImportSchedule });

  if (schedule === undefined) return NON_BREAKING_SPACE;
  if (schedule === null) return t("officialImport.schedule.off");
  if (schedule.minHours === schedule.maxHours) return t("officialImport.schedule.every", { count: schedule.minHours });
  return t("officialImport.schedule.range", { min: schedule.minHours, max: schedule.maxHours });
}

function LatestRunBadges({ run }: { run: ImportRunDetail }) {
  const { t } = useTranslation("admin");
  const tags = useRunTags(run);
  const outcome = getRunOutcome(run);

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
      <RunTagBadges tags={tags} />
      <Badge variant={isFailureOutcome(outcome) ? "destructive" : "secondary"}>
        <RunOutcomeIcon outcome={outcome} />
        {t(`officialImport.status.${outcome}`)}
      </Badge>
    </div>
  );
}

function LatestImportPanel({ overview, isError, isRetrying, onRetry }: LatestImportProps) {
  const { t } = useTranslation("admin");
  const scheduleDescription = useScheduleDescription();

  return (
    <section aria-labelledby="official-import-latest" className="min-w-0 rounded-lg border bg-card">
      <PanelHeader id="official-import-latest" title={t("officialImport.latest.title")} description={scheduleDescription}>
        {overview?.latest ? <LatestRunBadges run={overview.latest} /> : null}
      </PanelHeader>
      <div className="p-4">
        <LatestImportBody overview={overview} isError={isError} isRetrying={isRetrying} onRetry={onRetry} />
      </div>
    </section>
  );
}

function SourceImportControls({ source }: { source: OfficialSource }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [selectionOverrides, setSelectionOverrides] = useState<DatasetSelectionOverrides>({});
  const isImporting = useIsSourceImporting(source.key);
  const startMutation = useMutation({
    mutationFn: startImportRun,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importKeys.overview() }),
  });
  const selectedDatasetIds = getSelectedDatasetIds(source, selectionOverrides);
  const cannotStart = isImporting || selectedDatasetIds.length === 0 || startMutation.isPending;
  const isStartingDryRun = startMutation.isPending && startMutation.variables?.isDryRun === true;
  const labelId = `official-import-source-${source.key}`;

  function start(isDryRun: boolean): void {
    startMutation.mutate(buildStartRunBody(source.key, selectedDatasetIds, isDryRun));
  }

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span id={labelId} className="text-xs font-medium text-muted-foreground">
            {source.shortName}
          </span>
          {source.datasets.map((dataset) => (
            <label key={dataset.id} htmlFor={`official-import-dataset-${dataset.id}`} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                id={`official-import-dataset-${dataset.id}`}
                checked={selectedDatasetIds.includes(dataset.id)}
                onCheckedChange={(checked) => setSelectionOverrides((current) => ({ ...current, [dataset.id]: checked }))}
                disabled={isImporting}
              />
              {getDatasetLabel(dataset.key, t)}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => start(true)} disabled={cannotStart}>
            {isStartingDryRun ? <Spinner className="size-4" /> : null}
            {t("officialImport.dryRun.label")}
          </Button>
          <Button onClick={() => start(false)} disabled={cannotStart}>
            {startMutation.isPending && !isStartingDryRun ? <Spinner className="size-4" /> : null}
            {isImporting ? t("officialImport.alreadyRunning") : t("officialImport.startImport")}
          </Button>
        </div>
      </div>
      {startMutation.isError ? <InlineError title={t("officialImport.startFailed")} /> : null}
    </div>
  );
}

function ManualImportControls() {
  const { data: sources, isError, isFetching, refetch } = useQuery(freshOfficialSourcesQueryOptions);

  if (sources === undefined && isError) return <InlineError onRetry={() => refetch()} isRetrying={isFetching} />;
  if (sources === undefined) return <Skeleton className="h-8 w-72 max-w-full" />;

  return (
    <div className="flex flex-col items-start gap-3 md:items-end">
      {sources.map((source) => (
        <SourceImportControls key={source.key} source={source} />
      ))}
    </div>
  );
}

function ImportHistoryItem({ run }: { run: ImportRun }) {
  const { t, i18n } = useTranslation("admin");
  const [isOpen, setIsOpen] = useState(false);
  const { data: detail, isError, isFetching, refetch } = useQuery({ ...importRunQueryOptions(run.id), enabled: isOpen });
  const runTags = useRunTags(run);
  const tags = run.trigger === "manual" ? [t("officialImport.trigger.manual"), ...runTags] : runTags;
  const shownRun = isOpen && detail ? detail : run;
  const outcome = getRunOutcome(shownRun);
  const outcomeLabel = t(`officialImport.status.${outcome}`);

  let results: ReactNode;
  if (detail) results = <RunResults run={detail} />;
  else if (isError) results = <InlineError title={t("officialImport.latest.loadError")} onRetry={() => refetch()} isRetrying={isFetching} />;
  else results = <RunResultsSkeleton />;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <RunOutcomeIcon outcome={outcome} className="size-4" />
        <span className="font-medium tabular-nums">{formatImportTime(run.createdAt, i18n.language)}</span>
        {tags.length > 0 ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <RunTagBadges tags={tags} />
          </span>
        ) : null}
        {outcome === "success" ? (
          <span className="sr-only">{outcomeLabel}</span>
        ) : (
          <span className={cn("ml-auto text-xs whitespace-nowrap", getOutcomeTextClass(outcome))}>{outcomeLabel}</span>
        )}
        <span className={cn("w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums", outcome === "success" && "ml-auto")}>
          {formatRunDuration(shownRun)}
        </span>
        <span className="inline-flex shrink-0 transition-transform duration-150 group-data-panel-open:rotate-180 motion-reduce:transition-none">
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden">
        <div className="border-t bg-muted/30 px-4 py-3">
          <ImportRunDetails run={shownRun}>{results}</ImportRunDetails>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

type ImportHistoryListProps = {
  runs: ImportRun[];
  hasNextPage: boolean;
  isLoadingMore: boolean;
  hasLoadMoreFailed: boolean;
  onLoadMore: () => unknown;
};

function ImportHistoryList({ runs, hasNextPage, isLoadingMore, hasLoadMoreFailed, onLoadMore }: ImportHistoryListProps) {
  const { t, i18n } = useTranslation("admin");

  return (
    <>
      <div className="divide-y">
        {groupImportRunsByDay(runs, i18n.language).map((group) => (
          <div key={group.key} role="group" aria-labelledby={`official-import-day-${group.key}`}>
            <h3
              id={`official-import-day-${group.key}`}
              className="sticky top-0 z-10 border-b bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground first-letter:uppercase"
            >
              {group.label}
            </h3>
            <div className="divide-y">
              {group.runs.map((run) => (
                <ImportHistoryItem key={run.id} run={run} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {hasNextPage ? (
        <div className="border-t px-4 py-2">
          {hasLoadMoreFailed ? (
            <InlineError size="sm" title={t("officialImport.history.loadError")} onRetry={onLoadMore} isRetrying={isLoadingMore} />
          ) : (
            <Button variant="ghost" size="sm" disabled={isLoadingMore} onClick={() => void onLoadMore()}>
              {isLoadingMore ? <Spinner className="size-3.5" /> : null}
              {t("common:actions.showMore")}
            </Button>
          )}
        </div>
      ) : null}
    </>
  );
}

function ImportHistoryPanel({ latestRunId, isOverviewPending }: { latestRunId: string | undefined; isOverviewPending: boolean }) {
  const { t } = useTranslation("admin");
  const {
    data: history,
    isPending,
    isError,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery(importHistoryQueryOptions);
  const previousRuns = listPreviousRuns(history?.pages, latestRunId);

  let content: ReactNode;
  if (isPending || isOverviewPending) {
    content = (
      <div role="status" aria-label={t("officialImport.history.loading")} className="divide-y">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="ml-auto h-3.5 w-14" />
          </div>
        ))}
      </div>
    );
  } else if (previousRuns.length > 0) {
    content = (
      <ImportHistoryList
        runs={previousRuns}
        hasNextPage={hasNextPage}
        isLoadingMore={isFetchingNextPage}
        hasLoadMoreFailed={isFetchNextPageError}
        onLoadMore={() => fetchNextPage({ cancelRefetch: false })}
      />
    );
  } else if (isError && history === undefined) {
    content = <ErrorState title={t("officialImport.history.loadError")} onRetry={() => refetch()} isRetrying={isFetching} className="m-4" />;
  } else {
    content = <p className="px-4 py-6 text-sm text-muted-foreground">{t("officialImport.history.empty")}</p>;
  }

  return (
    <section aria-labelledby="official-import-history" className="min-w-0 overflow-clip rounded-lg border bg-card">
      <PanelHeader id="official-import-history" title={t("officialImport.history.title")} description={t("officialImport.history.description")} />
      {content}
    </section>
  );
}

function OfficialImportPage() {
  const { t } = useTranslation("admin");
  const {
    data: overview,
    isPending: isOverviewPending,
    isError: isOverviewError,
    isFetching: isOverviewFetching,
    refetch: refetchOverview,
  } = useQuery(importOverviewQueryOptions);

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-4 min-h-0 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.officialImport")}</h1>
          <p className="text-muted-foreground text-sm">{t("officialImport.subtitle")}</p>
        </div>
        <ManualImportControls />
      </div>
      <div className="@container flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="grid gap-4 pb-16 @4xl:grid-cols-2 @4xl:items-start @4xl:gap-x-6">
          <LatestImportPanel overview={overview} isError={isOverviewError} isRetrying={isOverviewFetching} onRetry={() => refetchOverview()} />
          <ImportHistoryPanel latestRunId={overview?.latest?.id} isOverviewPending={isOverviewPending} />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/official-import")({
  component: OfficialImportPage,
  staticData: {
    mainClassName: "overflow-hidden max-md:pb-0",
    titleKey: "items.officialImport",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.admin", path: "/admin/stations", i18nNamespace: "nav" }],
  },
});
