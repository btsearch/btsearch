import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DashboardCard } from "./dashboardCard";
import { InlineError } from "@/components/ui/error-state";
import { type JobState, getFailedImportSourceSteps, importStatusQueryOptions, isImportStatusInProgress } from "@/features/admin/uke-import/api";
import { StepDuration } from "@/features/admin/uke-import/StepDuration";
import { StepStatusIcon } from "@/features/admin/uke-import/StepStatusIcon";
import { cn } from "@/lib/utils";

const IMPORT_STATUS_STALE_TIME = 30_000;
const STATE_TEXT_CLASSES: Record<JobState, string> = {
  idle: "text-muted-foreground",
  running: "text-primary",
  success: "text-emerald-600 dark:text-emerald-500",
  error: "text-destructive",
};
const IMPORT_PAGE_LINK_CLASS =
  "rounded-sm text-xs font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export function ImportCard() {
  const { t } = useTranslation(["admin", "nav"]);
  const { data: importStatus } = useQuery({ ...importStatusQueryOptions, staleTime: IMPORT_STATUS_STALE_TIME, refetchOnMount: "always" });
  const title = t("nav:items.ukeImport");
  const state = importStatus?.state;
  const failedSourceSteps = getFailedImportSourceSteps(importStatus);
  const hasFailed = state === "error" || failedSourceSteps.length > 0;
  const showsSteps = isImportStatusInProgress(importStatus) || state === "error";

  return (
    <DashboardCard
      title={title}
      className="shrink-0"
      bodyClassName="gap-2.5 px-4 pt-3 pb-3.5"
      headEnd={
        <span className={cn("shrink-0 text-xs font-medium", state === undefined ? "text-muted-foreground" : STATE_TEXT_CLASSES[state])}>
          {state === undefined ? "-" : t(`ukeImport.status.${state}`, { defaultValue: state })}
        </span>
      }
    >
      {hasFailed ? (
        <InlineError
          size="sm"
          title={t("ukeImport.failure.dashboard")}
          description={failedSourceSteps.map((step) => t(`ukeImport.steps.${step.key}`)).join(", ")}
        />
      ) : null}
      {showsSteps ? (
        <div className="flex flex-col gap-1" role="list" aria-label={title}>
          {(importStatus?.steps ?? []).map((step) => (
            <div key={step.key} role="listitem" className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
              <StepStatusIcon status={step.status} className="size-3" />
              <span className="min-w-0 flex-1 text-[11px] font-medium">{t(`dashboard.importSteps.${step.key}`, { defaultValue: step.key })}</span>
              <span className="sr-only">{t(`ukeImport.stepStatus.${step.status}`, { defaultValue: step.status })}</span>
              <StepDuration key={step.startedAt} step={step} className="shrink-0 text-[11px] text-muted-foreground tabular-nums" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex">
        <Link to="/admin/uke-import" className={IMPORT_PAGE_LINK_CLASS}>
          {t("dashboard.openImportPage")}
        </Link>
      </div>
    </DashboardCard>
  );
}
