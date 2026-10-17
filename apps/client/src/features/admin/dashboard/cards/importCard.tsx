import type { ImportRunStatus } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DashboardCard } from "./dashboardCard";
import { InlineError } from "@/components/ui/error-state";
import { importOverviewQueryOptions } from "@/features/admin/official-import/api";
import {
  RUN_STATUS_OUTCOME,
  getAttentionDatasetKeys,
  getDatasetLabel,
  getRunDatasetRows,
  getRunStepRows,
  isRunLive,
} from "@/features/admin/official-import/runs";
import { StepDuration } from "@/features/admin/official-import/StepDuration";
import { StepStatusIcon } from "@/features/admin/official-import/StepStatusIcon";
import { cn } from "@/lib/utils";

const IMPORT_STATUS_STALE_TIME = 30_000;
const STATUS_TEXT_CLASSES: Record<ImportRunStatus, string> = {
  queued: "text-muted-foreground",
  running: "text-primary",
  done: "text-emerald-600 dark:text-emerald-500",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
};
const IMPORT_PAGE_LINK_CLASS =
  "rounded-sm text-xs font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";
const ROW_CLASS = "flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5";
const ROW_LABEL_CLASS = "min-w-0 flex-1 text-[11px] font-medium";

export function ImportCard() {
  const { t } = useTranslation(["admin", "nav"]);
  const { data: overview } = useQuery({ ...importOverviewQueryOptions, staleTime: IMPORT_STATUS_STALE_TIME, refetchOnMount: "always" });
  const title = t("nav:items.officialImport");
  const run = overview?.latest ?? null;
  const attentionDatasetLabels = run ? getAttentionDatasetKeys(run).map((datasetKey) => getDatasetLabel(datasetKey, t)) : [];
  const needsAttention = run?.status === "failed" || attentionDatasetLabels.length > 0;
  const showsSteps = isRunLive(run) || run?.status === "failed";

  return (
    <DashboardCard
      title={title}
      className="shrink-0"
      bodyClassName="gap-2.5 px-4 pt-3 pb-3.5"
      headEnd={
        <span className={cn("shrink-0 text-xs font-medium", run ? STATUS_TEXT_CLASSES[run.status] : "text-muted-foreground")}>
          {run ? t(`officialImport.status.${RUN_STATUS_OUTCOME[run.status]}`) : "-"}
        </span>
      }
    >
      {needsAttention ? (
        <InlineError size="sm" title={t("officialImport.failure.dashboard")} description={attentionDatasetLabels.join(", ")} />
      ) : null}
      {run && showsSteps ? (
        <div className="flex flex-col gap-1" role="list" aria-label={title}>
          {getRunDatasetRows(run).map((dataset) => (
            <div key={`dataset:${dataset.datasetKey}`} role="listitem" className={ROW_CLASS}>
              <StepStatusIcon status={dataset.status} className="size-3" />
              <span className={ROW_LABEL_CLASS}>{getDatasetLabel(dataset.datasetKey, t)}</span>
              <span className="sr-only">{t(`officialImport.stepStatus.${dataset.status}`)}</span>
            </div>
          ))}
          {getRunStepRows(run).map((step) => (
            <div key={`step:${step.step}`} role="listitem" className={ROW_CLASS}>
              <StepStatusIcon status={step.status} className="size-3" />
              <span className={ROW_LABEL_CLASS}>{t(`dashboard.importSteps.${step.step}`)}</span>
              <span className="sr-only">{t(`officialImport.stepStatus.${step.status}`)}</span>
              <StepDuration key={step.startedAt} step={step} className="shrink-0 text-[11px] text-muted-foreground tabular-nums" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex">
        <Link to="/admin/official-import" className={IMPORT_PAGE_LINK_CLASS}>
          {t("dashboard.openImportPage")}
        </Link>
      </div>
    </DashboardCard>
  );
}
