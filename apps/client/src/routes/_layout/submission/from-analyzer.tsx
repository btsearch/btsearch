import { AirportTowerIcon, AlertCircleIcon, CheckmarkCircle02Icon, File02Icon, InformationCircleIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RequireAuth } from "@/components/auth/requireAuth";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useNavActionTarget } from "@/contexts/navActions";
import { bandsQueryOptions } from "@/features/shared/queries";
import { applyAnalyzerBatch, createAnalyzerBatch } from "@/features/submissions/api";
import { AnalyzerStationGroupCard } from "@/features/submissions/components/batch/AnalyzerStationGroupCard";
import type { AnalyzerDraft } from "@/features/submissions/utils/analyzerDraftStore";
import { clearDraft, loadDraft } from "@/features/submissions/utils/analyzerDraftStore";
import { analyzerReviewReducer, createAnalyzerReviewState } from "@/features/submissions/utils/analyzerReviewState";
import { buildSubmissionPayloads } from "@/features/submissions/utils/fromAnalyzer";
import { useIsMobile } from "@/hooks/useMobile";
import { useSettings } from "@/hooks/useSettings";
import { getAnalyzerFormatLabel } from "@/lib/analyzer/analyzer-parsers";
import { showApiError } from "@/lib/api";
import type { Band } from "@/types/station";

export const Route = createFileRoute("/_layout/submission/from-analyzer")({
  validateSearch: (search: Record<string, unknown>) => ({
    draft: typeof search.draft === "string" && search.draft ? search.draft : undefined,
  }),
  loaderDeps: ({ search: { draft } }) => ({ draft }),
  loader: ({ deps: { draft } }) => {
    if (!draft) throw redirect({ to: "/analyzer" });
    const loadedDraft = loadDraft(draft);
    if (!loadedDraft) throw redirect({ to: "/analyzer" });
    return { loadedDraft };
  },
  component: FormAnalyzerPage,
  staticData: {
    titleKey: "batch.fromAnalyzerTitle",
    i18nNamespace: "submissions",
    breadcrumbs: [{ titleKey: "sections.contribute", i18nNamespace: "nav", path: "/submission" }],
    mainClassName: "overflow-hidden max-md:pb-0",
  },
});

function FormAnalyzerPage() {
  return <RequireAuth render={(session) => <AnalyzerReviewGate canApplyDirectly={["editor", "admin"].includes(session.user.role ?? "")} />} />;
}

function AnalyzerReviewGate({ canApplyDirectly }: { canApplyDirectly: boolean }) {
  const navigate = useNavigate();
  const settingsQuery = useSettings();
  const bandsQuery = useQuery(bandsQueryOptions());
  const submissionsEnabled = settingsQuery.data?.submissionsEnabled;
  const shouldRedirect = settingsQuery.data !== undefined && submissionsEnabled !== true;
  const bands = bandsQuery.data;
  const { loadedDraft: draft } = Route.useLoaderData();
  const { draft: draftId } = Route.useSearch();

  useEffect(() => {
    if (shouldRedirect) void navigate({ to: "/" });
  }, [shouldRedirect, navigate]);

  const isLoading = (submissionsEnabled === undefined && settingsQuery.isPending) || (bands === undefined && bandsQuery.isPending);
  const hasLoadError = (submissionsEnabled === undefined && settingsQuery.isError) || (bands === undefined && bandsQuery.isError);

  if (isLoading) return <AnalyzerReviewSkeleton />;
  if (hasLoadError) {
    return (
      <AnalyzerReviewLoadError
        onRetry={() => {
          void Promise.all([settingsQuery.refetch(), bandsQuery.refetch()]);
        }}
      />
    );
  }
  if (submissionsEnabled !== true || !draftId || bands === undefined) return null;

  return <LoadedAnalyzerReview key={draftId} draft={draft} draftId={draftId} bands={bands} canApplyDirectly={canApplyDirectly} />;
}

interface LoadedAnalyzerReviewProps {
  draft: AnalyzerDraft;
  draftId: string;
  bands: Band[];
  canApplyDirectly: boolean;
}

function LoadedAnalyzerReview({ draft, draftId, bands, canApplyDirectly }: LoadedAnalyzerReviewProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const navigate = useNavigate();
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const hasFloatingMobileActions = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const [reviewState, dispatch] = useReducer(analyzerReviewReducer, { draft, bands }, createAnalyzerReviewState);
  const [submitterNote, setSubmitterNote] = useState("");
  const { initialBatchDraft, stationEntries } = reviewState;
  const visibleEntries = stationEntries.flatMap((entry) =>
    entry.visible === null ? [] : [{ station: entry.visible, duplexSelections: entry.duplexSelections }],
  );
  const stations = visibleEntries.map(({ station }) => station);
  const batchDraft = { ...initialBatchDraft, stations };
  const hasRemovals = stationEntries.some((entry) => entry.removed || entry.removedCells.size > 0);

  const onDuplexChange = useCallback((stationId: number, rowIndex: number, duplex: string | null) => {
    dispatch({ type: "set-duplex", stationId, rowIndex, duplex });
  }, []);

  const removeCellFromSubmission = useCallback((stationId: number, rowIndex: number) => {
    dispatch({ type: "remove-cell", stationId, rowIndex });
  }, []);

  const removeStation = useCallback((stationId: number) => {
    dispatch({ type: "remove-station", stationId });
  }, []);

  const restoreRemovedChanges = useCallback(() => {
    dispatch({ type: "restore-removals" });
  }, []);

  const { mutate: submit, isPending: isSubmitting } = useMutation({
    mutationFn: () => createAnalyzerBatch(buildSubmissionPayloads(batchDraft), submitterNote),
    onSuccess: () => {
      if (draftId) clearDraft(draftId);
      toast.success(t("batch.submitSuccess"));
      void navigate({ to: "/account/submissions" });
    },
    onError: showApiError,
  });

  const { mutate: apply, isPending: isApplying } = useMutation({
    mutationFn: () => applyAnalyzerBatch(buildSubmissionPayloads(batchDraft)),
    onSuccess: () => {
      if (draftId) clearDraft(draftId);
      toast.success(t("batch.applySuccess"));
      void navigate({ to: "/analyzer" });
    },
    onError: showApiError,
  });

  const isPending = isSubmitting || isApplying;

  const totalCells = stations.reduce((num, station) => num + station.cells.length, 0);
  const hasConflicts = stations.some((station) => station.hasConflicts);
  const hasUnresolvedBands = stations.some((station) => station.cells.some((cell) => cell.operation === "add" && cell.band_id === null));
  const isBlocked = hasConflicts || hasUnresolvedBands;
  const validationDescriptionId = isBlocked ? "batch-validation-summary" : undefined;
  const fileName = draft.metadata.fileName || t("batch.unknownFile");
  const fileFormat = draft.metadata.fileFormat ? getAnalyzerFormatLabel(draft.metadata.fileFormat) : null;
  const actions = (
    <AnalyzerReviewActions
      floating={hasFloatingMobileActions}
      canApplyDirectly={canApplyDirectly}
      isBlocked={isBlocked}
      isPending={isPending}
      isSubmitting={isSubmitting}
      isApplying={isApplying}
      validationDescriptionId={validationDescriptionId}
      onSubmit={() => submit()}
      onApply={() => apply()}
    />
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="w-full space-y-5 p-3 md:p-4 lg:p-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{t("batch.fromAnalyzerTitle")}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">{t("batch.fromAnalyzerDescription")}</p>
          </header>

          <section aria-label={t("batch.sourceFile")} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-col sm:flex-row sm:items-stretch">
              <div className="flex min-w-0 flex-1 items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={File02Icon} className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{fileName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fileFormat ? `${fileFormat} · ` : null}
                    {t("batch.parsedRowCount", { count: initialBatchDraft.metadata.parsedRows })}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 border-t bg-muted/20 sm:min-w-64 sm:border-l sm:border-t-0">
                <div className="flex flex-col justify-center px-4 py-3">
                  <span className="text-xs text-muted-foreground">{t("common:labels.stations")}</span>
                  <span className="font-mono text-lg font-semibold tabular-nums">{stations.length}</span>
                </div>
                <div className="flex flex-col justify-center border-l px-4 py-3">
                  <span className="text-xs text-muted-foreground">{t("table.cells")}</span>
                  <span className="font-mono text-lg font-semibold tabular-nums">{totalCells}</span>
                </div>
              </div>
            </div>
          </section>

          {stations.length === 0 ? (
            <AnalyzerReviewEmpty hasRemovals={hasRemovals} onRestore={restoreRemovedChanges} onBack={() => navigate({ to: "/analyzer" })} />
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <main className="order-2 min-w-0 space-y-3 xl:order-1">
                <div className="flex min-h-9 items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">{t("batch.reviewChanges")}</h2>
                    <p className="text-xs text-muted-foreground">
                      {t("batch.stationCount", { count: stations.length })} · {t("batch.cellCount", { count: totalCells })}
                    </p>
                  </div>
                  {hasRemovals ? (
                    <Button variant="ghost" onClick={restoreRemovedChanges}>
                      <HugeiconsIcon icon={RefreshIcon} className="size-4" aria-hidden="true" />
                      {t("batch.restoreRemoved")}
                    </Button>
                  ) : null}
                </div>

                {visibleEntries.map(({ station, duplexSelections }) => (
                  <AnalyzerStationGroupCard
                    key={station.stationInternalId}
                    station={station}
                    duplexSelections={duplexSelections}
                    onDuplexChange={onDuplexChange}
                    onRemoveCell={removeCellFromSubmission}
                    onRemoveStation={removeStation}
                  />
                ))}
              </main>

              <aside className="order-1 overflow-hidden rounded-xl border bg-card xl:order-2 xl:sticky xl:top-4">
                <section id="batch-validation-summary" aria-labelledby="batch-validation-heading" aria-live="polite" className="p-4">
                  <h2 id="batch-validation-heading" className="text-sm font-semibold">
                    {t(isBlocked ? "batch.issuesTitle" : "batch.readyTitle")}
                  </h2>
                  {isBlocked ? (
                    <div className="mt-3 space-y-3">
                      {hasConflicts ? (
                        <div className="flex items-start gap-2.5 text-destructive">
                          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          <div>
                            <p className="text-xs font-semibold">{t("batch.conflictBadge")}</p>
                            <p className="mt-0.5 text-xs text-destructive/80">{t("batch.conflictsWarning")}</p>
                          </div>
                        </div>
                      ) : null}
                      {hasUnresolvedBands ? (
                        <div className="flex items-start gap-2.5 text-amber-700 dark:text-amber-400">
                          <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          <div>
                            <p className="text-xs font-semibold">{t("batch.unresolvedBandsTitle")}</p>
                            <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">{t("batch.unresolvedBandsWarning")}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 flex items-start gap-2.5 text-emerald-700 dark:text-emerald-400">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <p className="text-xs">{t("batch.readyDescription")}</p>
                    </div>
                  )}
                </section>

                <section className="border-t p-4">
                  <label htmlFor="submitterNote" className="text-sm font-medium">
                    {t("batch.submitterNote")}
                  </label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("batch.submitterNoteHint")}</p>
                  <Textarea
                    id="submitterNote"
                    value={submitterNote}
                    onChange={(event) => setSubmitterNote(event.target.value)}
                    placeholder={t("batch.submitterNotePlaceholder")}
                    rows={4}
                    className="mt-3 resize-y text-sm"
                  />
                </section>

                <section className="space-y-2 border-t p-4">
                  {!canApplyDirectly ? <p className="pb-1 text-xs text-muted-foreground">{t("batch.batchRateLimit")}</p> : null}
                  {hasFloatingMobileActions ? null : actions}

                  <Button size="lg" variant="ghost" disabled={isPending} onClick={() => navigate({ to: "/analyzer" })} className="h-11 w-full xl:h-9">
                    {t("common:actions.cancel")}
                  </Button>
                </section>
              </aside>
            </div>
          )}
        </div>
      </div>

      {hasFloatingMobileActions && navActionTarget && stations.length > 0 ? createPortal(actions, navActionTarget) : null}
    </>
  );
}

interface AnalyzerReviewActionsProps {
  floating: boolean;
  canApplyDirectly: boolean;
  isBlocked: boolean;
  isPending: boolean;
  isSubmitting: boolean;
  isApplying: boolean;
  validationDescriptionId: string | undefined;
  onSubmit: () => void;
  onApply: () => void;
}

function AnalyzerReviewActions({
  floating,
  canApplyDirectly,
  isBlocked,
  isPending,
  isSubmitting,
  isApplying,
  validationDescriptionId,
  onSubmit,
  onApply,
}: AnalyzerReviewActionsProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const buttonClassName = floating ? "h-11 min-w-0 flex-1 cursor-pointer px-3" : "h-11 w-full cursor-pointer xl:h-9";

  return (
    <div className={floating ? "flex min-w-0 items-center gap-1" : "space-y-2"}>
      <Button size="lg" disabled={isBlocked || isPending} aria-describedby={validationDescriptionId} onClick={onSubmit} className={buttonClassName}>
        {isSubmitting ? <Spinner className="size-4" /> : null}
        {t("batch.submit")}
      </Button>

      {canApplyDirectly ? (
        <div className={floating ? "contents" : "space-y-2 border-t pt-3"}>
          {floating ? null : <p className="text-xs text-muted-foreground">{t("batch.applyDirectlyHint")}</p>}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  size="lg"
                  variant="secondary"
                  disabled={isBlocked || isPending}
                  className={`${buttonClassName} disabled:cursor-pointer disabled:pointer-events-auto!`}
                  aria-describedby={validationDescriptionId}
                />
              }
            >
              {isApplying ? <Spinner className="size-4" /> : null}
              {t("batch.applyDirectly")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("batch.applyDirectlyConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("batch.applyDirectlyConfirmDesc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction className="cursor-pointer" onClick={onApply}>
                  {t("batch.applyDirectly")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </div>
  );
}

function AnalyzerReviewSkeleton() {
  const { t } = useTranslation("submissions");

  return (
    <div className="flex-1 overflow-y-auto" aria-busy="true" aria-label={t("batch.loading")}>
      <div className="w-full space-y-5 p-3 md:p-4 lg:p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-52 w-full rounded-xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function AnalyzerReviewLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(["submissions", "common"]);

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">{t("batch.loadErrorTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("batch.loadErrorDescription")}</p>
        <Button className="mt-5" onClick={onRetry}>
          <HugeiconsIcon icon={RefreshIcon} className="size-4" aria-hidden="true" />
          {t("common:actions.retry")}
        </Button>
      </div>
    </div>
  );
}

function AnalyzerReviewEmpty({ hasRemovals, onRestore, onBack }: { hasRemovals: boolean; onRestore: () => void; onBack: () => void }) {
  const { t } = useTranslation(["submissions", "common"]);

  return (
    <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed bg-muted/10 p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <HugeiconsIcon icon={AirportTowerIcon} className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">{t("batch.noStations")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("batch.noStationsDescription")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {hasRemovals ? (
            <Button onClick={onRestore}>
              <HugeiconsIcon icon={RefreshIcon} className="size-4" aria-hidden="true" />
              {t("batch.restoreRemoved")}
            </Button>
          ) : null}
          <Button variant={hasRemovals ? "outline" : "default"} onClick={onBack}>
            {t("batch.backToAnalyzer")}
          </Button>
        </div>
      </div>
    </div>
  );
}
