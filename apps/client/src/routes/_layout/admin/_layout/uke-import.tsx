import { AlertCircleIcon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  type ImportJobStatus,
  type JobState,
  type StartImportPayload,
  type StepStatus,
  UKE_IMPORT_STATUS_QUERY_KEY,
  importHistoryQueryOptions,
  importStatusQueryOptions,
  isImportStatusInProgress,
  startImport,
} from "@/features/admin/uke-import/api";
import { StepDuration } from "@/features/admin/uke-import/StepDuration";
import { StepStatusIcon } from "@/features/admin/uke-import/StepStatusIcon";
import { formatDuration, formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type JobOutcome = JobState | "completedWithErrors";

interface ImportDayGroup {
  key: number;
  label: string;
  jobs: ImportJobStatus[];
}

const JOB_STATE_ICON_STATUS: Record<JobState, StepStatus> = {
  idle: "pending",
  running: "running",
  success: "success",
  error: "error",
};

const SOURCE_KEYS = ["importPermits", "importRadiolines", "importDeviceRegistry"] as const;

const HISTORY_PAGE_SIZE = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const relativeDayFormatters = new Map<string, Intl.RelativeTimeFormat>();

function getCachedFormatter<T>(cache: Map<string, T>, locale: string, create: () => T): T {
  let formatter = cache.get(locale);
  if (!formatter) {
    formatter = create();
    cache.set(locale, formatter);
  }
  return formatter;
}

function getJobOutcome(job: ImportJobStatus): JobOutcome {
  if (job.state === "success" && job.steps.some((step) => step.status === "error")) return "completedWithErrors";
  return job.state;
}

function isFailureOutcome(outcome: JobOutcome): boolean {
  return outcome === "error" || outcome === "completedWithErrors";
}

function getJobDuration(job: ImportJobStatus): string | null {
  if (!job.startedAt || !job.finishedAt) return null;
  const elapsed = Date.parse(job.finishedAt) - Date.parse(job.startedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? formatDuration(elapsed) : null;
}

function formatImportTime(date: string, locale: string): string {
  return getCachedFormatter(timeFormatters, locale, () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" })).format(
    new Date(date),
  );
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupImportsByDay(jobs: ImportJobStatus[], locale: string): ImportDayGroup[] {
  const today = startOfLocalDay(new Date());
  const relativeDays = getCachedFormatter(relativeDayFormatters, locale, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));
  const days = getCachedFormatter(dayFormatters, locale, () => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }));
  const groups: ImportDayGroup[] = [];

  for (const job of jobs) {
    if (!job.startedAt) continue;
    const startedAt = new Date(job.startedAt);
    const day = startOfLocalDay(startedAt);
    const previous = groups.at(-1);
    if (previous?.key === day) {
      previous.jobs.push(job);
      continue;
    }

    const daysAgo = Math.round((today - day) / DAY_MS);
    const label = daysAgo === 0 || daysAgo === 1 ? relativeDays.format(-daysAgo || 0, "day") : days.format(startedAt);
    groups.push({ key: day, label, jobs: [job] });
  }

  return groups;
}

function JobOutcomeIcon({ outcome, className }: { outcome: JobOutcome; className?: string }) {
  if (outcome === "completedWithErrors")
    return <HugeiconsIcon icon={AlertCircleIcon} className={cn("shrink-0 text-destructive", className)} aria-hidden="true" />;
  return <StepStatusIcon status={JOB_STATE_ICON_STATUS[outcome]} className={className} />;
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

function ImportJobDetails({ job }: { job: ImportJobStatus }) {
  const { t, i18n } = useTranslation("admin");
  const duration = getJobDuration(job);

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {job.startedAt ? <DetailItem label={t("ukeImport.startedAt")}>{formatFullDate(job.startedAt, i18n.language)}</DetailItem> : null}
        {job.finishedAt ? <DetailItem label={t("ukeImport.finishedAt")}>{formatFullDate(job.finishedAt, i18n.language)}</DetailItem> : null}
        {duration ? <DetailItem label={t("ukeImport.duration")}>{duration}</DetailItem> : null}
        {job.trigger ? <DetailItem label={t("ukeImport.trigger.label")}>{t(`ukeImport.trigger.${job.trigger}`)}</DetailItem> : null}
      </dl>

      {job.error ? (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/5">
          <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" />
          <AlertDescription className="whitespace-pre-wrap wrap-break-word">{job.error}</AlertDescription>
        </Alert>
      ) : null}

      {job.steps.length > 0 ? (
        <ol className="flex flex-col gap-0.5">
          {job.steps.map((step) => (
            <li
              key={step.key}
              className={cn("rounded-md", step.status === "running" && "bg-primary/5", step.status === "error" && "bg-destructive/5")}
            >
              <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <StepStatusIcon status={step.status} className="size-4" />
                <span className={cn("min-w-0 flex-1", (step.status === "skipped" || step.status === "pending") && "text-muted-foreground")}>
                  {t(`ukeImport.steps.${step.key}`)}
                </span>
                <StepDuration key={step.startedAt} step={step} className="shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums" />
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{t(`ukeImport.stepStatus.${step.status}`)}</span>
              </div>
              {step.error ? (
                <pre className="mx-3 mb-2 max-h-40 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs text-destructive">
                  {step.error}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function LatestImportBody({ status, isError }: { status: ImportJobStatus | undefined; isError: boolean }) {
  const { t } = useTranslation("admin");

  if (status?.state === "idle") return <p className="text-sm text-muted-foreground">{t("ukeImport.latest.empty")}</p>;
  if (status) return <ImportJobDetails job={status} />;
  if (isError) return <p className="text-sm text-destructive">{t("ukeImport.latest.loadError")}</p>;

  return (
    <div role="status" aria-label={t("ukeImport.latest.loading")} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-8" />
        ))}
      </div>
    </div>
  );
}

function LatestImportPanel({ status, isError }: { status: ImportJobStatus | undefined; isError: boolean }) {
  const { t } = useTranslation("admin");
  const outcome = status && status.state !== "idle" ? getJobOutcome(status) : null;

  return (
    <section aria-labelledby="uke-import-latest" className="min-w-0 rounded-lg border bg-card">
      <PanelHeader id="uke-import-latest" title={t("ukeImport.latest.title")} description={t("ukeImport.hourlySchedule")}>
        {outcome ? (
          <Badge variant={isFailureOutcome(outcome) ? "destructive" : "secondary"}>
            <JobOutcomeIcon outcome={outcome} />
            {t(`ukeImport.status.${outcome}`)}
          </Badge>
        ) : null}
      </PanelHeader>
      <div className="p-4">
        <LatestImportBody status={status} isError={isError} />
      </div>
    </section>
  );
}

function ManualImportControls({ isRunning }: { isRunning: boolean }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [sources, setSources] = useState<Required<StartImportPayload>>({ importPermits: true, importRadiolines: true, importDeviceRegistry: true });
  const hasSelectedSource = SOURCE_KEYS.some((key) => sources[key]);

  const startMutation = useMutation({
    mutationFn: startImport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: UKE_IMPORT_STATUS_QUERY_KEY }),
  });

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div role="group" aria-labelledby="uke-import-sources" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span id="uke-import-sources" className="text-xs font-medium text-muted-foreground">
            {t("ukeImport.sources.label")}
          </span>
          {SOURCE_KEYS.map((key) => (
            <label key={key} htmlFor={`uke-import-${key}`} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                id={`uke-import-${key}`}
                checked={sources[key]}
                onCheckedChange={(checked) => setSources((current) => ({ ...current, [key]: checked }))}
                disabled={isRunning}
              />
              {t(`ukeImport.sources.${key}`)}
            </label>
          ))}
        </div>
        <Button onClick={() => startMutation.mutate(sources)} disabled={isRunning || !hasSelectedSource || startMutation.isPending}>
          {startMutation.isPending ? <Spinner className="size-4" /> : null}
          {isRunning ? t("ukeImport.alreadyRunning") : t("ukeImport.startImport")}
        </Button>
      </div>
      {startMutation.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {t("ukeImport.startFailed")}
        </p>
      ) : null}
    </div>
  );
}

function ImportHistoryItem({ job }: { job: ImportJobStatus }) {
  const { t, i18n } = useTranslation("admin");
  const outcome = getJobOutcome(job);
  const outcomeLabel = t(`ukeImport.status.${outcome}`);

  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <JobOutcomeIcon outcome={outcome} className="size-4" />
        <span className="font-medium tabular-nums">{job.startedAt ? formatImportTime(job.startedAt, i18n.language) : null}</span>
        {job.trigger === "manual" ? <Badge variant="outline">{t("ukeImport.trigger.manual")}</Badge> : null}
        {outcome === "success" ? (
          <span className="sr-only">{outcomeLabel}</span>
        ) : (
          <span className={cn("ml-auto text-xs whitespace-nowrap", isFailureOutcome(outcome) ? "text-destructive" : "text-muted-foreground")}>
            {outcomeLabel}
          </span>
        )}
        <span className={cn("w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums", outcome === "success" && "ml-auto")}>
          {getJobDuration(job)}
        </span>
        <span className="inline-flex shrink-0 transition-transform duration-150 group-data-panel-open:rotate-180 motion-reduce:transition-none">
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden">
        <div className="border-t bg-muted/30 px-4 py-3">
          <ImportJobDetails job={job} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ImportHistoryList({ jobs }: { jobs: ImportJobStatus[] }) {
  const { t, i18n } = useTranslation("admin");
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const hiddenCount = jobs.length - visibleCount;

  return (
    <>
      <div className="divide-y">
        {groupImportsByDay(jobs.slice(0, visibleCount), i18n.language).map((group) => (
          <div key={group.key} role="group" aria-labelledby={`uke-import-day-${group.key}`}>
            <h3
              id={`uke-import-day-${group.key}`}
              className="sticky top-0 z-10 border-b bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground first-letter:uppercase"
            >
              {group.label}
            </h3>
            <div className="divide-y">
              {group.jobs.map((job) => (
                <ImportHistoryItem key={job.id} job={job} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <div className="border-t px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => setVisibleCount((count) => count + HISTORY_PAGE_SIZE)}>
            {t("ukeImport.history.showMore", { count: Math.min(hiddenCount, HISTORY_PAGE_SIZE) })}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function ImportHistoryPanel({ currentJobId, isStatusPending }: { currentJobId: string | undefined; isStatusPending: boolean }) {
  const { t } = useTranslation("admin");
  const { data: history, isPending, isError } = useQuery(importHistoryQueryOptions);
  const previousImports = history?.filter((job) => job.id !== currentJobId) ?? [];

  let content: ReactNode;
  if (isPending || isStatusPending) {
    content = (
      <div role="status" aria-label={t("ukeImport.history.loading")} className="divide-y">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="ml-auto h-3.5 w-14" />
          </div>
        ))}
      </div>
    );
  } else if (previousImports.length > 0) {
    content = <ImportHistoryList jobs={previousImports} />;
  } else {
    content = (
      <p className={cn("px-4 py-6 text-sm", isError ? "text-destructive" : "text-muted-foreground")}>
        {isError ? t("ukeImport.history.loadError") : t("ukeImport.history.empty")}
      </p>
    );
  }

  return (
    <section aria-labelledby="uke-import-history" className="min-w-0 overflow-clip rounded-lg border bg-card">
      <PanelHeader id="uke-import-history" title={t("ukeImport.history.title")} description={t("ukeImport.history.description")} />
      {content}
    </section>
  );
}

function UkeImportPage() {
  const { t } = useTranslation("admin");
  const { data: status, isPending: isStatusPending, isError: isStatusError } = useQuery(importStatusQueryOptions);

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-4 min-h-0 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("ukeImport.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("ukeImport.subtitle")}</p>
        </div>
        <ManualImportControls isRunning={isImportStatusInProgress(status)} />
      </div>
      <div className="@container flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="grid gap-4 pb-16 @4xl:grid-cols-2 @4xl:items-start @4xl:gap-x-6">
          <LatestImportPanel status={status} isError={isStatusError} />
          <ImportHistoryPanel currentJobId={status?.id} isStatusPending={isStatusPending} />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/uke-import")({
  component: UkeImportPage,
  staticData: {
    mainClassName: "overflow-hidden max-md:pb-0",
    titleKey: "breadcrumbs.ukeImport",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" }],
  },
});
