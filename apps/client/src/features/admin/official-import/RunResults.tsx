import type { ImportRunApproval, ImportRunChangeCount, ImportRunDetail } from "@openbts/shared/contract";
import { IMPORT_SLICE_OUTCOMES } from "@openbts/shared/contract/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { importKeys, startImportRun, useIsSourceImporting } from "./api";
import {
  type HeldSlice,
  type RunDatasetRow,
  type StepStatus,
  buildApprovalRunBody,
  getChangesOutsideSlices,
  getDatasetLabel,
  getRunDatasetRows,
  getRunStepRows,
  getSkipReasonLabel,
  getSliceLabel,
  hasLostDryRunReport,
} from "./runs";
import { StepDuration } from "./StepDuration";
import { StepStatusIcon } from "./StepStatusIcon";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { showApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Fact = { key: string; label: string; count: number };

const ERROR_TEXT_CLASS = "mx-3 mb-2 max-h-40 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs text-destructive";
const DURATION_CLASS = "shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums";
const MUTED_STATUSES = new Set<StepStatus>(["pending", "unchanged", "skipped", "stopped"]);

function ResultRow({ status, label, duration, children }: { status: StepStatus; label: string; duration?: ReactNode; children?: ReactNode }) {
  const { t } = useTranslation("admin");

  return (
    <li className={cn("rounded-md", status === "running" && "bg-primary/5", status === "error" && "bg-destructive/5")}>
      <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
        <StepStatusIcon status={status} className="size-4" />
        <span className={cn("min-w-0 flex-1", MUTED_STATUSES.has(status) && "text-muted-foreground")}>{label}</span>
        {duration}
        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{t(`officialImport.stepStatus.${status}`)}</span>
      </div>
      {children}
    </li>
  );
}

function FactLine({ label, facts }: { label: string; facts: readonly Fact[] }) {
  const { i18n } = useTranslation();

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      <span className="font-medium">{label}</span>
      {facts.map((fact) => (
        <span key={fact.key}>
          {fact.label} <span className="tabular-nums">{fact.count.toLocaleString(i18n.language)}</span>
        </span>
      ))}
    </div>
  );
}

function useChangeFacts(changes: readonly ImportRunChangeCount[]): Fact[] {
  const { t } = useTranslation("admin");
  return changes.map(({ kind, count }) => ({ key: kind, label: t(`officialImport.changes.${kind}`), count }));
}

function DatasetFacts({ dataset }: { dataset: RunDatasetRow }) {
  const { t } = useTranslation("admin");
  const changeFacts = useChangeFacts(dataset.changes);
  const sliceFacts = IMPORT_SLICE_OUTCOMES.flatMap((outcome) => {
    const count = dataset.sliceCounts[outcome];
    return count > 0 ? [{ key: outcome, label: t(`officialImport.sliceOutcome.${outcome}`), count }] : [];
  });
  if (sliceFacts.length === 0) return null;

  return (
    <div className="mx-3 mb-2 flex flex-col gap-1 text-xs text-muted-foreground">
      <FactLine label={t("officialImport.slices")} facts={sliceFacts} />
      {changeFacts.length > 0 ? <FactLine label={t("officialImport.changes.label")} facts={changeFacts} /> : null}
      {dataset.skips.length > 0 ? (
        <FactLine
          label={t("officialImport.skippedRecords")}
          facts={dataset.skips.map(({ reason, count }) => ({ key: reason, label: getSkipReasonLabel(reason, t), count }))}
        />
      ) : null}
    </div>
  );
}

type ApplyHeldSliceButtonProps = {
  sourceKey: string;
  approval: ImportRunApproval;
  datasetLabel: string;
  heldText: string;
};

function ApplyHeldSliceButton({ sourceKey, approval, datasetLabel, heldText }: ApplyHeldSliceButtonProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const isImporting = useIsSourceImporting(sourceKey);
  const applyMutation = useMutation({
    mutationFn: () => startImportRun(buildApprovalRunBody(sourceKey, approval)),
    onSuccess: () => {
      setIsConfirming(false);
      return queryClient.invalidateQueries({ queryKey: importKeys.overview() });
    },
    onError: showApiError,
  });

  return (
    <>
      <Button variant="outline" size="xs" disabled={isImporting} onClick={() => setIsConfirming(true)}>
        {t("officialImport.held.apply")}
      </Button>
      <AlertDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (!applyMutation.isPending) setIsConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("officialImport.held.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("officialImport.held.confirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium wrap-anywhere">{datasetLabel}</p>
            <p className="text-xs text-muted-foreground wrap-anywhere">{heldText}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyMutation.isPending}>{t("common:actions.cancel")}</AlertDialogCancel>
            <Button className="cursor-pointer" disabled={applyMutation.isPending} onClick={() => applyMutation.mutate()}>
              {applyMutation.isPending ? <Spinner /> : null}
              {t("officialImport.held.apply")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function HeldSliceLine({ sourceKey, datasetLabel, slice }: { sourceKey: string; datasetLabel: string; slice: HeldSlice }) {
  const { t } = useTranslation("admin");
  const counts = { releaseRecordCount: slice.releaseRecordCount, storedRecordCount: slice.storedRecordCount };
  const sliceLabel = getSliceLabel(slice.sliceKey);
  const heldText = sliceLabel === "" ? t("officialImport.held.dataset", counts) : t("officialImport.held.slice", { ...counts, slice: sliceLabel });

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
      <span className="min-w-0 wrap-anywhere text-amber-700 dark:text-amber-400">{heldText}</span>
      {slice.approval ? (
        <ApplyHeldSliceButton sourceKey={sourceKey} approval={slice.approval} datasetLabel={datasetLabel} heldText={heldText} />
      ) : null}
    </div>
  );
}

function DatasetRow({ sourceKey, dataset }: { sourceKey: string; dataset: RunDatasetRow }) {
  const { t } = useTranslation("admin");
  const datasetLabel = getDatasetLabel(dataset.datasetKey, t);

  return (
    <ResultRow status={dataset.status} label={datasetLabel}>
      {dataset.error ? <pre className={ERROR_TEXT_CLASS}>{dataset.error}</pre> : null}
      <DatasetFacts dataset={dataset} />
      {dataset.heldSlices.length > 0 ? (
        <div className="mx-3 mb-2 flex flex-col gap-1">
          {dataset.heldSlices.map((slice) => (
            <HeldSliceLine key={`slice:${slice.sliceKey}`} sourceKey={sourceKey} datasetLabel={datasetLabel} slice={slice} />
          ))}
        </div>
      ) : null}
    </ResultRow>
  );
}

function OtherChanges({ run }: { run: ImportRunDetail }) {
  const { t } = useTranslation("admin");
  const changeFacts = useChangeFacts(getChangesOutsideSlices(run));
  const report = run.dryRunReport;
  const nameFacts = report
    ? [
        { key: "stationNamesWritten", label: t("officialImport.dryRun.stationNamesWritten"), count: report.stationNamesWritten },
        { key: "stationNamesSkipped", label: t("officialImport.dryRun.stationNamesSkipped"), count: report.stationNamesSkipped },
        { key: "licenseeNamesCorrected", label: t("officialImport.dryRun.licenseeNamesCorrected"), count: report.licenseeNamesCorrected },
      ].filter((fact) => fact.count > 0)
    : [];
  const facts = [...changeFacts, ...nameFacts];
  if (facts.length === 0) return null;

  return (
    <div className="px-3 text-xs text-muted-foreground">
      <FactLine label={t("officialImport.changes.other")} facts={facts} />
    </div>
  );
}

export function RunResults({ run }: { run: ImportRunDetail }) {
  const { t } = useTranslation("admin");
  const datasets = getRunDatasetRows(run);
  const steps = getRunStepRows(run);

  return (
    <>
      {hasLostDryRunReport(run) ? <p className="text-sm text-muted-foreground">{t("officialImport.dryRun.reportGone")}</p> : null}
      {datasets.length + steps.length > 0 ? (
        <ol className="flex flex-col gap-0.5">
          {datasets.map((dataset) => (
            <DatasetRow key={`dataset:${dataset.datasetKey}`} sourceKey={run.sourceKey} dataset={dataset} />
          ))}
          {steps.map((step) => (
            <ResultRow
              key={`step:${step.step}`}
              status={step.status}
              label={t(`officialImport.steps.${step.step}`)}
              duration={<StepDuration key={step.startedAt} step={step} className={DURATION_CLASS} />}
            >
              {step.error ? <pre className={ERROR_TEXT_CLASS}>{step.error}</pre> : null}
            </ResultRow>
          ))}
        </ol>
      ) : null}
      <OtherChanges run={run} />
    </>
  );
}
