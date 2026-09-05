import { AirportTowerIcon, AlertCircleIcon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { bandsQueryOptions } from "@/features/shared/queries";
import { applyAnalyzerBatch, createAnalyzerBatch } from "@/features/submissions/api";
import { AnalyzerStationGroupCard } from "@/features/submissions/components/batch/AnalyzerStationGroupCard";
import { clearDraft, loadDraft } from "@/features/submissions/utils/analyzerDraftStore";
import { buildAnalyzerBatchDraft, buildSubmissionPayloads } from "@/features/submissions/utils/fromAnalyzer";
import { useSettings } from "@/hooks/useSettings";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

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
  },
});

function FormAnalyzerPage() {
  const { t } = useTranslation(["submissions", "common"]);
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { data: bands } = useQuery(bandsQueryOptions());
  const { loadedDraft: draft } = Route.useLoaderData();
  const { draft: draftId } = Route.useSearch();
  const { data: session } = authClient.useSession();
  const canApplyDirectly = ["editor", "admin"].includes(session?.user?.role ?? "");

  const initialBatchDraft = useMemo(() => buildAnalyzerBatchDraft(draft, bands ?? []), [draft, bands]);
  const [removedCells, setRemovedCells] = useState<Set<number>>(() => new Set());
  const [removedStations, setRemovedStations] = useState<Set<number>>(() => new Set());
  const [duplexSelections, setDuplexSelections] = useState<Map<number, string | null>>(() => new Map());
  const [submitterNote, setSubmitterNote] = useState("");

  const stations = useMemo(
    () =>
      initialBatchDraft.stations
        .filter((s) => !removedStations.has(s.stationInternalId))
        .map((s) => ({
          ...s,
          cells: s.cells
            .filter((c) => !removedCells.has(c._rowIndex))
            .map((c) => {
              if (c.duplexChoices.length === 0) return c;
              const sel = duplexSelections.get(c._rowIndex);
              if (sel === undefined) return c;
              return { ...c, band_id: c.duplexChoices.find((d) => d.duplex === sel)?.band_id ?? null };
            }),
        }))
        .filter((s) => s.cells.length > 0),
    [initialBatchDraft, removedCells, removedStations, duplexSelections],
  );

  const batchDraft = useMemo(() => ({ ...initialBatchDraft, stations }), [initialBatchDraft, stations]);

  const onDuplexChange = useCallback((rowIndex: number, duplex: string | null) => {
    setDuplexSelections((prev) => new Map(prev).set(rowIndex, duplex));
  }, []);

  const removeCellFromSubmission = useCallback((_stationInternalId: number, rowIndex: number) => {
    setRemovedCells((prev) => new Set(prev).add(rowIndex));
  }, []);

  const removeStation = useCallback((stationInternalId: number) => {
    setRemovedStations((prev) => new Set(prev).add(stationInternalId));
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

  useEffect(() => {
    if (settings !== undefined && !settings.submissionsEnabled) void navigate({ to: "/" });
  }, [settings, navigate]);

  if (settings === undefined || !settings.submissionsEnabled || !draftId) return null;

  const totalCells = stations.reduce((num, station) => num + station.cells.length, 0);
  const hasConflicts = stations.some((station) => station.hasConflicts);
  const hasUnresolvedBands = stations.some((s) => s.cells.some((c) => c.operation === "add" && c.band_id === null));
  const stationsWithTooFewCells = stations.filter((s) => s.cells.length < 1);
  const isBlocked = hasConflicts || hasUnresolvedBands || stationsWithTooFewCells.length > 0;

  if (stations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">{t("batch.noStations")}</p>
        <Button onClick={() => navigate({ to: "/analyzer" })}>{t("batch.backToAnalyzer")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3 space-y-0.5">
        <h1 className="text-xl font-bold tracking-tight">{t("batch.fromAnalyzerTitle")}</h1>
        <p className="text-sm text-muted-foreground truncate">{draft.metadata.fileName}</p>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row lg:divide-x divide-border">
        <aside className="flex flex-col gap-4 overflow-y-auto border-b p-4 lg:border-b-0 lg:w-72 xl:w-80 shrink-0 max-h-80 lg:max-h-none">
          <div className="rounded-lg border border-border/60 bg-muted/20 divide-y divide-border/60">
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <HugeiconsIcon icon={AirportTowerIcon} className="size-3.5" />
                {t("common:labels.stations")}
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">{stations.length}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-xs text-muted-foreground">{t("table.cells", { ns: "submissions" })}</span>
              <span className="font-mono text-sm font-semibold tabular-nums">{totalCells}</span>
            </div>
          </div>

          {hasConflicts ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 flex items-start gap-2.5">
              <HugeiconsIcon icon={AlertCircleIcon} className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-destructive">{t("batch.conflictBadge")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("batch.conflictsWarning")}</p>
              </div>
            </div>
          ) : null}

          {hasUnresolvedBands ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 flex items-start gap-2.5">
              <HugeiconsIcon icon={InformationCircleIcon} className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t("batch.unresolvedBandsWarning")}</p>
            </div>
          ) : null}

          {stationsWithTooFewCells.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 flex items-start gap-2.5">
              <HugeiconsIcon icon={InformationCircleIcon} className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {t("batch.tooFewCellsWarning", { count: stationsWithTooFewCells.length })}
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="submitterNote" className="text-xs font-medium text-muted-foreground">
              {t("batch.submitterNote")}
            </label>
            <Textarea
              id="submitterNote"
              value={submitterNote}
              onChange={(e) => setSubmitterNote(e.target.value)}
              placeholder={t("batch.submitterNotePlaceholder")}
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          <div className="hidden flex-1 lg:block" />

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-[11px] text-muted-foreground text-center">{t("batch.batchRateLimit")}</p>
            {canApplyDirectly ? (
              <AlertDialog>
                <AlertDialogTrigger render={<Button size="sm" variant="secondary" disabled={isBlocked || isPending} className="w-full" />}>
                  {isApplying ? <Spinner className="size-3.5" /> : null}
                  {t("batch.applyDirectly")}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("batch.applyDirectlyConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("batch.applyDirectlyConfirmDesc")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => apply()}>{t("common:actions.submit")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <Button size="sm" disabled={isBlocked || isPending} onClick={() => submit()} className="w-full">
              {isPending ? <Spinner className="size-3.5" /> : null}
              {t("batch.submit")}
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => navigate({ to: "/analyzer" })} className="w-full">
              {t("common:actions.cancel")}
            </Button>
          </div>
        </aside>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
          {stations.map((station) => (
            <AnalyzerStationGroupCard
              key={station.stationInternalId}
              station={station}
              getDuplex={(rowIndex) => duplexSelections.get(rowIndex)}
              onDuplexChange={onDuplexChange}
              onRemoveCell={(rowIndex) => removeCellFromSubmission(station.stationInternalId, rowIndex)}
              onRemoveStation={() => removeStation(station.stationInternalId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
