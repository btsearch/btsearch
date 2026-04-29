import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CellDraftBase } from "@/features/admin/cells/cellEditRow";
import { CellsEditor } from "@/features/admin/cells/cellsEditor";
import { useCellDrafts } from "@/features/admin/cells/hooks/useCellDrafts";
import { RAT_ORDER } from "@/features/admin/cells/rat";
import { bandsQueryOptions, operatorsQueryOptions } from "@/features/admin/queries";
import { AdminReviewCard } from "@/features/admin/submissions/components/adminReviewCard";
import { SubmissionDetailHeader } from "@/features/admin/submissions/components/submissionDetailHeader";
import { SubmissionDiffDetailCells } from "@/features/admin/submissions/components/submissionDiffRowCells";
import { SubmissionLocationPhotoSelectionsSection } from "@/features/admin/submissions/components/submissionLocationPhotoSelectionsSection";
import { SubmissionPhotosSection } from "@/features/admin/submissions/components/submissionPhotosSection";
import { SubmissionStationForm } from "@/features/admin/submissions/components/submissionStationForm";
import { SubmitterCard } from "@/features/admin/submissions/components/submitterCard";
import { useApproveSubmissionMutation, useRejectSubmissionMutation, useSaveSubmissionMutation } from "@/features/admin/submissions/mutations";
import type { SubmissionDetail } from "@/features/admin/submissions/types";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { fetchApiData, showApiError } from "@/lib/api";
import type { Band, Cell, Station } from "@/types/station";

type LocalCell = CellDraftBase & {
  _serverId?: number;
  operation: "add" | "update" | "delete" | "unchanged";
  target_cell_id: number | null;
};

function getOperationBorderClass(operation: string): string | undefined {
  if (operation === "add") return "border-l-2 border-l-green-500";
  if (operation === "update") return "border-l-2 border-l-amber-500";
  if (operation === "delete") return "border-l-2 border-l-red-500";
  if (operation === "unchanged") return "border-l-2 border-l-transparent";
  return undefined;
}

function computeInitialCells(submission: SubmissionDetail, currentStation: Station | null): LocalCell[] {
  if (submission.status !== "pending") {
    return submission.cells.map((cell) => ({
      _localId: crypto.randomUUID(),
      _serverId: cell.id,
      operation: cell.operation,
      target_cell_id: cell.target_cell_id,
      rat: cell.rat ?? "",
      band_id: cell.band_id ?? 0,
      is_confirmed: cell.is_confirmed,
      notes: cell.notes ?? "",
      details: { ...cell.details },
    }));
  }

  const proposedTargetIds = new Set(
    submission.cells
      .filter((c) => (c.operation === "update" || c.operation === "delete") && c.target_cell_id !== null)
      .map((c) => c.target_cell_id as number),
  );

  const unchangedCells: LocalCell[] = (currentStation?.cells ?? [])
    .filter((c) => !proposedTargetIds.has(c.id))
    .map((c) => ({
      _localId: crypto.randomUUID(),
      operation: "unchanged" as const,
      target_cell_id: c.id,
      rat: c.rat as (typeof RAT_ORDER)[number],
      band_id: c.band.id,
      is_confirmed: c.is_confirmed,
      notes: c.notes ?? "",
      details: (c.details as Record<string, unknown>) ?? {},
    }));

  const proposedCells: LocalCell[] = submission.cells.map((cell) => {
    if (cell.operation === "delete" && cell.target_cell_id && currentStation?.cells) {
      const target = currentStation.cells.find((c) => c.id === cell.target_cell_id);
      if (target) {
        return {
          _localId: crypto.randomUUID(),
          _serverId: cell.id,
          operation: cell.operation,
          target_cell_id: cell.target_cell_id,
          rat: target.rat as (typeof RAT_ORDER)[number],
          band_id: target.band.id,
          is_confirmed: target.is_confirmed,
          notes: target.notes ?? "",
          details: (target.details as Record<string, unknown>) ?? {},
        };
      }
    }
    return {
      _localId: crypto.randomUUID(),
      _serverId: cell.id,
      operation: cell.operation,
      target_cell_id: cell.target_cell_id,
      rat: cell.rat ?? "",
      band_id: cell.band_id ?? 0,
      is_confirmed: cell.is_confirmed,
      notes: cell.notes ?? "",
      details: { ...cell.details },
    };
  });

  return [...unchangedCells, ...proposedCells];
}

function SubmissionDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("submissions");

  const { data: submission, isLoading } = useQuery({
    queryKey: ["admin", "submission", id],
    queryFn: () => fetchApiData<SubmissionDetail>(`submissions/${id}`),
    enabled: !!id,
  });

  const { data: currentStation } = useQuery({
    queryKey: ["station", submission?.station?.id],
    queryFn: () => fetchApiData<Station>(`stations/${submission?.station?.id}`),
    enabled: !!submission?.station?.id && (submission?.type === "update" || submission?.type === "delete"),
    staleTime: 1000 * 60 * 30,
  });

  const needsCurrentStation = submission && (submission.type === "update" || submission.type === "delete") && submission.station?.id;
  const isReady = submission && (!needsCurrentStation || currentStation);

  if (isLoading || (submission && !isReady)) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-background px-4 py-2 flex items-center justify-between gap-4">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-7 w-40 rounded-md" />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-[1.5_0_300px]">
              <Skeleton className="h-52 w-full rounded-xl" />
            </div>
            <div className="flex-[2.5_0_500px] max-md:flex-[1_1_auto] max-md:min-w-0 space-y-2">
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{t("common:error.description")}</p>
          <Button variant="outline" onClick={() => navigate({ to: "/admin/submissions", search: { page: 0, q: undefined } })}>
            {t("common:actions.back")}
          </Button>
        </div>
      </div>
    );
  }

  return <SubmissionDetailForm key={submission.id} submission={submission} currentStation={currentStation ?? null} />;
}

function SubmissionDetailForm({ submission, currentStation }: { submission: SubmissionDetail; currentStation: Station | null }) {
  const { t } = useTranslation(["submissions", "common"]);
  const queryClient = useQueryClient();

  const [reviewNotes, setReviewNotes] = useState(submission.review_notes ?? "");
  const initialUpdatedAt = useRef(submission.updatedAt);

  const saveMutation = useSaveSubmissionMutation();
  const approveMutation = useApproveSubmissionMutation();
  const rejectMutation = useRejectSubmissionMutation();

  const [stationForm, setStationForm] = useState<{
    station_id: string;
    operator_id: number | null;
    notes: string;
  }>(() => ({
    station_id: submission.proposedStation?.station_id ?? submission.station?.station_id ?? "",
    operator_id: submission.proposedStation?.operator_id ?? submission.station?.operator_id ?? null,
    notes: submission.proposedStation?.notes ?? submission.station?.notes ?? "",
  }));

  const [extraForm, setExtraForm] = useState<{
    networks_id: number | null;
    networks_name: string;
    mno_name: string;
  }>(() => ({
    networks_id: submission.proposedStation?.networks_id ?? null,
    networks_name: submission.proposedStation?.networks_name ?? "",
    mno_name: submission.proposedStation?.mno_name ?? "",
  }));

  const isReadOnly = submission.status !== "pending";
  const isDeleteSubmission = submission.type === "delete";
  const isFormDisabled = isReadOnly || isDeleteSubmission;

  const [locationForm, setLocationForm] = useState<ProposedLocationForm>(() => {
    if (isReadOnly && currentStation?.location) {
      return {
        region_id: currentStation.location.region.id,
        city: currentStation.location.city ?? "",
        address: currentStation.location.address ?? "",
        longitude: currentStation.location.longitude,
        latitude: currentStation.location.latitude,
      };
    }

    return {
      region_id: submission.proposedLocation?.region_id ?? null,
      city: submission.proposedLocation?.city ?? "",
      address: submission.proposedLocation?.address ?? "",
      longitude: submission.proposedLocation?.longitude ?? null,
      latitude: submission.proposedLocation?.latitude ?? null,
    };
  });

  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { data: allBands = [] } = useQuery(bandsQueryOptions());

  const initialCells = useMemo(() => computeInitialCells(submission, currentStation), [submission, currentStation]);

  const createNewSubmissionCell = useCallback(
    (rat: string, defaultBand: Band): LocalCell => ({
      _localId: crypto.randomUUID(),
      operation: "add",
      target_cell_id: null,
      rat: rat as (typeof RAT_ORDER)[number],
      band_id: defaultBand.id,
      is_confirmed: false,
      notes: "",
      details: {},
    }),
    [],
  );

  const {
    cells: localCells,
    cellsByRat,
    enabledRats,
    toggleRat: handleToggleRat,
    changeCell: handleCellChange,
    addCell: handleAddCell,
    cloneCell: handleCloneCell,
    clonedIds,
    deleteCell: handleDeleteCell,
  } = useCellDrafts<LocalCell>({
    initialCells,
    allBands,
    createNewCell: createNewSubmissionCell,
    disabled: isFormDisabled,
  });

  const visibleRats = useMemo(() => RAT_ORDER.filter((r) => enabledRats.includes(r)), [enabledRats]);

  const isProcessing = saveMutation.isPending || approveMutation.isPending || rejectMutation.isPending;

  const checkStaleness = useCallback(async (): Promise<boolean> => {
    try {
      const fresh = await fetchApiData<SubmissionDetail>(`submissions/${submission.id}`);
      if (fresh.updatedAt !== initialUpdatedAt.current) {
        toast.warning(t("detail.staleWarning"));
        void queryClient.invalidateQueries({ queryKey: ["admin", "submission", submission.id] });
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }, [submission.id, t, queryClient]);

  const handleSave = () => {
    saveMutation.mutate(
      {
        submissionId: submission.id,
        reviewNotes,
        stationForm,
        extraForm,
        locationForm,
        localCells,
      },
      {
        onSuccess: (response) => {
          const updatedAt = (response as { data?: { updatedAt?: string } })?.data?.updatedAt;
          if (updatedAt) initialUpdatedAt.current = updatedAt;
          toast.success(t("toast.saved"));
        },
        onError: (error) => showApiError(error),
      },
    );
  };

  const handleApprove = async () => {
    if (await checkStaleness()) return;
    approveMutation.mutate(
      { submissionId: submission.id, reviewNotes },
      {
        onSuccess: () => {
          toast.success(t("toast.approved"));
          window.history.back();
        },
        onError: (error) => showApiError(error),
      },
    );
  };

  const handleReject = async () => {
    if (await checkStaleness()) return;
    rejectMutation.mutate(
      { submissionId: submission.id, reviewNotes },
      {
        onSuccess: () => {
          toast.success(t("toast.rejected"));
          window.history.back();
        },
        onError: (error) => showApiError(error),
      },
    );
  };

  const selectedOperator = useMemo(() => operators.find((o) => o.id === stationForm.operator_id), [operators, stationForm.operator_id]);

  const currentOperator = useMemo(
    () => (submission.station ? operators.find((o) => o.id === submission.station?.operator_id) : null),
    [operators, submission],
  );

  const stationDiffs = useMemo(() => {
    if (submission.type !== "update" || !submission.station || !submission.proposedStation) return null;
    const cur = submission.station;
    const proposed = submission.proposedStation;
    return {
      station_id: proposed.station_id !== null && proposed.station_id !== cur.station_id,
      operator_id: proposed.operator_id !== null && proposed.operator_id !== cur.operator_id,
      notes: (proposed.notes ?? null) !== (cur.notes ?? null),
    };
  }, [submission]);

  const locationDiffs = useMemo(() => {
    if (submission.type !== "update" || !currentStation?.location || !submission.proposedLocation) return null;
    const cur = currentStation.location;
    const proposed = submission.proposedLocation;
    return {
      coords: proposed.latitude !== cur.latitude || proposed.longitude !== cur.longitude,
      city: (proposed.city ?? "") !== (cur.city ?? ""),
      address: (proposed.address ?? "") !== (cur.address ?? ""),
      region: proposed.region_id !== cur.region.id,
    };
  }, [submission, currentStation]);

  const currentCellsMap = useMemo(() => {
    if (!currentStation?.cells) return new Map<number, Cell>();
    return new Map(currentStation.cells.map((c) => [c.id, c]));
  }, [currentStation]);

  const getSubmissionDiffBadges = useCallback(
    (_rat: string, cellsForRat: LocalCell[]) => ({
      added: cellsForRat.filter((c) => c.operation === "add").length,
      modified: cellsForRat.filter((c) => c.operation === "update").length,
      deleted: cellsForRat.filter((c) => c.operation === "delete").length,
    }),
    [],
  );

  const handleConfirmAllCellsInRat = useCallback(
    (rat: string) => {
      const cellsForRat = cellsByRat[rat] ?? [];
      cellsForRat.forEach((cell) => {
        if (cell.operation !== "delete") handleCellChange(cell._localId, { is_confirmed: true });
      });
    },
    [cellsByRat, handleCellChange],
  );

  const getSubmissionCellProps = useCallback(
    (cell: LocalCell) => ({
      disabled: isFormDisabled || cell.operation === "delete" || cell.operation === "unchanged",
      leftBorderClass: getOperationBorderClass(cell.operation),
      showDelete: !isFormDisabled && cell.operation !== "unchanged" && cell.operation !== "delete",
      rowClassName: cell.operation === "unchanged" ? "opacity-40" : undefined,
    }),
    [isFormDisabled],
  );

  const renderSubmissionAfterRow = useCallback(
    (cell: LocalCell) => {
      if (isReadOnly) return null;
      const targetCell = cell.operation === "update" && cell.target_cell_id ? currentCellsMap.get(cell.target_cell_id) : null;
      if (!targetCell) return null;

      const details = (targetCell.details ?? {}) as Record<string, unknown>;
      const changedKeys = new Set(Object.keys({ ...details, ...cell.details }).filter((k) => details[k] !== cell.details[k]));

      return (
        <tr className="bg-amber-50/40 dark:bg-amber-950/15 border-b last:border-0">
          <td className="px-3 py-1 border-l-2 border-l-amber-400/60">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {t("diff.was")}
            </span>
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">{targetCell.band.value}</span>
          </td>
          {targetCell.rat !== "GSM" && <td className="px-3 py-1 font-mono text-xs text-muted-foreground">{targetCell.band.duplex ?? "-"}</td>}
          <SubmissionDiffDetailCells details={details} rat={targetCell.rat} changedKeys={changedKeys} />
          <td className="px-3 py-1 font-mono text-xs text-muted-foreground truncate max-w-28">{targetCell.notes || "-"}</td>
          <td className="px-3 py-1" />
          <td className="px-3 py-1" />
        </tr>
      );
    },
    [currentCellsMap, isReadOnly, t],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SubmissionDetailHeader
        submission={submission}
        isReadOnly={isReadOnly}
        isProcessing={isProcessing}
        onApprove={handleApprove}
        onReject={handleReject}
        onSave={handleSave}
      />

      <div className="flex-1 overflow-y-auto">
        {isDeleteSubmission && (
          <div className="mx-3 mt-3 rounded-xl border-2 border-red-500/30 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-start gap-3">
            <div className="shrink-0 size-10 rounded-full bg-red-500/15 flex items-center justify-center">
              <HugeiconsIcon icon={Delete02Icon} className="size-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{t("common:submissionType.delete")}</p>
              <p className="text-sm text-red-600/80 dark:text-red-400/80">
                {t("deletionBanner", { stationId: submission.station?.station_id ?? submission.station_id })}
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3 p-3">
          <div className="flex-[2_0_420px] min-w-0 max-md:flex-[1_1_auto] space-y-2">
            <SubmitterCard submission={submission} />
            <AdminReviewCard submission={submission} reviewNotes={reviewNotes} onReviewNotesChange={setReviewNotes} isReadOnly={isReadOnly} />

            <SubmissionStationForm
              submission={submission}
              stationForm={stationForm}
              onStationFormChange={(patch) => setStationForm((prev) => ({ ...prev, ...patch }))}
              extraIdsForm={extraForm}
              onExtraIdsChange={(patch) => setExtraForm((prev) => ({ ...prev, ...patch }))}
              locationForm={locationForm}
              onLocationFormChange={(patch) => setLocationForm((prev) => ({ ...prev, ...patch }))}
              operators={operators}
              selectedOperator={selectedOperator}
              currentOperator={currentOperator}
              currentStation={currentStation ?? null}
              stationDiffs={stationDiffs}
              locationDiffs={locationDiffs}
              isFormDisabled={isFormDisabled}
              isDeleteSubmission={isDeleteSubmission}
            />
            <SubmissionLocationPhotoSelectionsSection photos={submission.locationPhotoSelections} />
            <SubmissionPhotosSection submissionId={submission.id} readOnly={isReadOnly} />
          </div>

          <div className="flex-[5_0_500px] min-w-0 max-md:flex-[1_1_auto] space-y-2">
            <CellsEditor
              cellsByRat={cellsByRat}
              enabledRats={enabledRats}
              visibleRats={visibleRats}
              bands={allBands}
              onToggleRat={handleToggleRat}
              onCellChange={handleCellChange}
              onAddCell={handleAddCell}
              onCloneCell={!isFormDisabled ? handleCloneCell : undefined}
              clonedIds={clonedIds}
              onDeleteCell={handleDeleteCell}
              ratPillsDisabled={isReadOnly}
              showAddButton={!isFormDisabled}
              showConfirmCellsButton={!isFormDisabled}
              onConfirmAllCellsInRat={handleConfirmAllCellsInRat}
              getDiffBadges={getSubmissionDiffBadges}
              getCellProps={getSubmissionCellProps}
              renderAfterRow={renderSubmissionAfterRow}
              readOnly={isFormDisabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/submissions/$id")({
  component: SubmissionDetailPage,
  staticData: {
    titleKey: "detail.title",
    i18nNamespace: "submissions",
    breadcrumbs: [
      { titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" },
      { titleKey: "breadcrumbs.submissions", path: "/admin/submissions", i18nNamespace: "admin" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
