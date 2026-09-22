import { AlertCircleIcon, Cancel01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  type JobState,
  type StepStatus,
  UKE_IMPORT_STATUS_QUERY_KEY,
  getFailedImportSourceSteps,
  importStatusQueryOptions,
  isImportStatusInProgress,
  startImport,
} from "@/features/admin/uke-import/api";
import { StepDuration } from "@/features/admin/uke-import/StepDuration";
import { i18n } from "@/i18n";
import { cn } from "@/lib/utils";

function StepStatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return <Spinner className="size-4" />;
    case "success":
      return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-green-500" />;
    case "error":
      return <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-destructive" />;
    case "skipped":
      return <span className="text-muted-foreground text-sm">-</span>;
    default:
      return <span className="size-4 inline-flex items-center justify-center text-muted-foreground">○</span>;
  }
}

function JobStateIndicator({ state }: { state: JobState }) {
  switch (state) {
    case "running":
      return (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-500">
          <Spinner className="size-3.5" />
        </span>
      );
    case "success":
      return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-green-500" />;
    case "error":
      return <HugeiconsIcon icon={AlertCircleIcon} className="size-4 text-destructive" />;
    default:
      return <span className="size-4 inline-flex items-center justify-center text-muted-foreground">○</span>;
  }
}

function UkeImportPage() {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();

  const [importPermits, setImportPermits] = useState(true);
  const [importRadiolines, setImportRadiolines] = useState(true);
  const [importDeviceRegistry, setImportDeviceRegistry] = useState(true);

  const { data: status } = useQuery(importStatusQueryOptions);

  const startMutation = useMutation({
    mutationFn: startImport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: UKE_IMPORT_STATUS_QUERY_KEY }),
  });

  const isRunning = isImportStatusInProgress(status);
  const failedSourceSteps = getFailedImportSourceSteps(status);
  const hasImportFailure = failedSourceSteps.length > 0 || status?.state === "error";

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("ukeImport.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("ukeImport.subtitle")}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-4 pb-8 max-w-4xl">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold leading-none mb-4">{t("ukeImport.title")}</h3>
            <div className="space-y-3">
              <label htmlFor="import-permits" className="flex items-center gap-2 cursor-pointer">
                <Checkbox id="import-permits" checked={importPermits} onCheckedChange={(val) => setImportPermits(!!val)} disabled={isRunning} />
                <span className="text-sm">{t("ukeImport.importPermits")}</span>
              </label>
              <label htmlFor="import-radiolines" className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  id="import-radiolines"
                  checked={importRadiolines}
                  onCheckedChange={(val) => setImportRadiolines(!!val)}
                  disabled={isRunning}
                />
                <span className="text-sm">{t("ukeImport.importRadiolines")}</span>
              </label>
              <label htmlFor="import-device-registry" className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  id="import-device-registry"
                  checked={importDeviceRegistry}
                  onCheckedChange={(val) => setImportDeviceRegistry(!!val)}
                  disabled={isRunning}
                />
                <span className="text-sm">{t("ukeImport.importDeviceRegistry")}</span>
              </label>
            </div>
            <div className="mt-4">
              <Button
                onClick={() => startMutation.mutate({ importPermits, importRadiolines, importDeviceRegistry })}
                disabled={isRunning || startMutation.isPending}
              >
                {startMutation.isPending ? <Spinner className="size-4 mr-2" /> : null}
                {isRunning ? t("ukeImport.alreadyRunning") : t("ukeImport.startImport")}
              </Button>
            </div>
          </div>

          {status && (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <JobStateIndicator state={status.state} />
                <h3 className="text-sm font-semibold leading-none">{t(`ukeImport.status.${status.state}`)}</h3>
              </div>

              {status.startedAt && (
                <p className="text-xs text-muted-foreground mb-1">
                  {t("ukeImport.startedAt")}:{" "}
                  {new Date(status.startedAt).toLocaleDateString(i18n.language, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              {status.finishedAt && (
                <p className="text-xs text-muted-foreground mb-1">
                  {t("ukeImport.finishedAt")}:{" "}
                  {new Date(status.finishedAt).toLocaleDateString(i18n.language, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}

              {hasImportFailure ? (
                <Alert variant="destructive" className="mt-3 mb-3">
                  <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" />
                  <AlertTitle>{t("ukeImport.failure.title")}</AlertTitle>
                  <AlertDescription className="mt-1 space-y-2 text-left">
                    {failedSourceSteps.length > 0 ? (
                      <div>
                        <p className="font-medium">{t("ukeImport.failure.failedSources")}</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {failedSourceSteps.map((step) => (
                            <li key={step.key}>{t(`ukeImport.steps.${step.key}`)}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {isRunning ? <p>{t("ukeImport.failure.continuing")}</p> : null}
                    {status.error ? (
                      <div>
                        <p className="font-medium">{t("ukeImport.failure.details")}</p>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md bg-destructive/5 p-2 font-mono text-xs">
                          {status.error}
                        </pre>
                      </div>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {status.steps.length > 0 && (
                <div className="mt-3 space-y-2">
                  {status.steps.map((step) => (
                    <div
                      key={step.key}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                        step.status === "running" && "bg-blue-500/5",
                        step.status === "error" && "bg-destructive/5",
                        step.status === "success" && "bg-green-500/5",
                      )}
                    >
                      <StepStatusIcon status={step.status} />
                      <span className="flex-1">{t(`ukeImport.steps.${step.key}`)}</span>
                      <StepDuration key={step.startedAt} step={step} className="text-xs text-muted-foreground tabular-nums" />
                      <span className="text-xs text-muted-foreground">{t(`ukeImport.stepStatus.${step.status}`)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/uke-import")({
  component: UkeImportPage,
  staticData: {
    titleKey: "breadcrumbs.ukeImport",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" }],
  },
});
