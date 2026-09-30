import { ArrowLeft01Icon, Delete02Icon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";
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
import { countCellOperations } from "@/features/admin/submissions/utils";
import { CELL_TYPE_LABELS, DEFAULT_CELL_TYPE } from "@/features/shared/cellTypes";
import { getRatShowsBandDuplex } from "@/features/shared/rat";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { computeSectorPayloads, orderSectorsById, remapSectorAssignment } from "@/features/submissions/utils/cells";
import {
  EMPTY_STATION_VALUES,
  applyProposedLocation,
  applyProposedSectors,
  applyProposedStation,
  diffLocationValues,
  diffStationValues,
  proposedSectorDrafts,
  toLocationPayload,
  toLocationValues,
  toSectorDrafts,
  toStationPayload,
  toStationValues,
} from "@/features/submissions/utils/proposalChanges";
import { useSaveShortcut } from "@/hooks/useSaveShortcut";
import { ApiResponseError, fetchApiData, showApiError } from "@/lib/api";
import { shallowEqual } from "@/lib/shallowEqual";
import { cn } from "@/lib/utils";
import type { Band, Cell, Sector, SectorDraft, Station, UplinkType } from "@/types/station";

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
      _localId: nanoid(),
      _serverId: cell.id,
      operation: cell.operation,
      target_cell_id: cell.target_cell_id,
      _sectorLocalId: cell.sector_local_id ?? (cell.target_sector_id ? `sector-${cell.target_sector_id}` : cell.sector_unassigned ? null : undefined),
      rat: cell.rat ?? "",
      band_id: cell.band_id ?? 0,
      type: cell.type ?? null,
      is_confirmed: cell.is_confirmed,
      notes: cell.notes ?? "",
      details: { ...cell.details },
    }));
  }

  const proposedTargetIds = new Set<number>();
  for (const cell of submission.cells)
    if ((cell.operation === "update" || cell.operation === "delete") && cell.target_cell_id !== null && cell.target_cell_id !== undefined)
      proposedTargetIds.add(cell.target_cell_id);

  const currentCells = currentStation?.cells ?? [];
  const currentCellsById = new Map(currentCells.map((cell) => [cell.id, cell] as const));

  const unchangedCells: LocalCell[] = currentCells
    .filter((c) => !proposedTargetIds.has(c.id))
    .map((c) => ({
      _localId: nanoid(),
      operation: "unchanged" as const,
      target_cell_id: c.id,
      _sectorLocalId: c.sector_id ? `sector-${c.sector_id}` : null,
      rat: c.rat as (typeof RAT_ORDER)[number],
      band_id: c.band.id,
      type: c.type ?? null,
      is_confirmed: c.is_confirmed,
      notes: c.notes ?? "",
      details: (c.details as Record<string, unknown>) ?? {},
    }));

  const proposedCells: LocalCell[] = submission.cells.map((cell) => {
    if (cell.operation === "delete" && cell.target_cell_id !== null && cell.target_cell_id !== undefined) {
      const target = currentCellsById.get(cell.target_cell_id);
      if (target) {
        return {
          _localId: nanoid(),
          _serverId: cell.id,
          operation: cell.operation,
          target_cell_id: cell.target_cell_id,
          _sectorLocalId: target.sector_id ? `sector-${target.sector_id}` : null,
          rat: target.rat as (typeof RAT_ORDER)[number],
          band_id: target.band.id,
          type: target.type ?? null,
          is_confirmed: target.is_confirmed,
          notes: target.notes ?? "",
          details: (target.details as Record<string, unknown>) ?? {},
        };
      }
    }
    return {
      _localId: nanoid(),
      _serverId: cell.id,
      operation: cell.operation,
      target_cell_id: cell.target_cell_id,
      _sectorLocalId: cell.sector_local_id ?? (cell.target_sector_id ? `sector-${cell.target_sector_id}` : cell.sector_unassigned ? null : undefined),
      rat: cell.rat ?? "",
      band_id: cell.band_id ?? 0,
      type: cell.type ?? null,
      is_confirmed: cell.is_confirmed,
      notes: cell.notes ?? "",
      details: { ...cell.details },
    };
  });

  return [...unchangedCells, ...proposedCells];
}

function parseExistingSectorLocalId(localId: string): number | null {
  if (!localId.startsWith("sector-")) return null;
  const sectorId = Number.parseInt(localId.slice("sector-".length), 10);
  return Number.isNaN(sectorId) ? null : sectorId;
}

function getAssignedExistingSectorId(
  sectorLocalId: string | null | undefined,
  draftSectorByLocalId: ReadonlyMap<string, SectorDraft>,
  fallbackSectorId: number | null,
): number | null {
  if (sectorLocalId === undefined) return fallbackSectorId;
  if (sectorLocalId === null) return null;
  return draftSectorByLocalId.get(sectorLocalId)?.id ?? parseExistingSectorLocalId(sectorLocalId);
}

function isSectorAssignmentChanged(
  sectorLocalId: string | null | undefined,
  draftSectorByLocalId: ReadonlyMap<string, SectorDraft>,
  targetSectorId: number | null,
): boolean {
  if (sectorLocalId === undefined) return false;
  if (sectorLocalId === null) return targetSectorId !== null;

  const draftSectorId = draftSectorByLocalId.get(sectorLocalId)?.id ?? parseExistingSectorLocalId(sectorLocalId);
  if (draftSectorId === null) return true;
  return draftSectorId !== targetSectorId;
}

function hasSectorAzimuthChanged(
  sectorId: number | null,
  currentSectorById: ReadonlyMap<number, Sector>,
  draftSectorById: ReadonlyMap<number, SectorDraft>,
): boolean {
  if (sectorId === null) return false;
  const currentSector = currentSectorById.get(sectorId);
  const draftSector = draftSectorById.get(sectorId);
  return currentSector !== undefined && draftSector !== undefined && draftSector.azimuth !== currentSector.azimuth;
}

function getChangedDetailKeys(oldDetails: Record<string, unknown>, newDetails: Record<string, unknown>): Set<string> {
  const changedKeys = new Set<string>();
  for (const key of Object.keys(oldDetails)) if (oldDetails[key] !== newDetails[key]) changedKeys.add(key);
  for (const key of Object.keys(newDetails)) if (oldDetails[key] !== newDetails[key]) changedKeys.add(key);
  return changedKeys;
}

function haveSectorsChanged(sectors: SectorDraft[], saved: SectorDraft[]): boolean {
  return (
    sectors.length !== saved.length ||
    sectors.some((sector, index) => sector._localId !== saved[index]?._localId || sector.azimuth !== saved[index]?.azimuth)
  );
}

function haveCellsChanged(cells: LocalCell[], saved: LocalCell[]): boolean {
  if (cells.length !== saved.length) return true;
  const savedCells = new Set(saved);
  return cells.some((cell) => !savedCells.has(cell));
}

function BackToSubmissionsButton({ variant }: { variant: "default" | "outline" }) {
  const { t } = useTranslation("common");

  return (
    <Button variant={variant} nativeButton={false} render={<Link to="/admin/submissions" search={{ page: 0, q: undefined }} />}>
      <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
      {t("actions.back")}
    </Button>
  );
}

function SubmissionDetailPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation("submissions");
  const [mountedAt] = useState(Date.now);

  const {
    data: submission,
    dataUpdatedAt: submissionUpdatedAt,
    error,
    isFetching,
    isFetchedAfterMount: isSubmissionFetchedAfterMount,
    refetch,
  } = useQuery({
    queryKey: ["admin", "submission", id],
    queryFn: () => fetchApiData<SubmissionDetail>(`submissions/${id}`),
    enabled: !!id,
    staleTime: 0,
  });

  const {
    data: currentStation,
    dataUpdatedAt: currentStationUpdatedAt,
    isFetching: isFetchingCurrentStation,
    isFetchedAfterMount: isCurrentStationFetchedAfterMount,
    refetch: refetchCurrentStation,
  } = useQuery({
    queryKey: ["station", submission?.station?.id],
    queryFn: () => fetchApiData<Station>(`stations/${submission?.station?.id}`),
    enabled: !!submission?.station?.id && (submission?.type === "update" || submission?.type === "delete"),
    staleTime: 0,
  });

  const needsCurrentStation = submission && (submission.type === "update" || submission.type === "delete") && submission.station?.id;
  const isSubmissionFresh = submission !== undefined && submissionUpdatedAt >= mountedAt;
  const isCurrentStationFresh = currentStation !== undefined && currentStationUpdatedAt >= mountedAt;
  const isSubmissionPending = !isSubmissionFresh && !isSubmissionFetchedAfterMount;
  const isCurrentStationPending = needsCurrentStation && !isCurrentStationFresh && !isCurrentStationFetchedAfterMount;

  if (isSubmissionPending || isCurrentStationPending) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
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
            <div className="flex-[2_0_420px] min-w-0 max-md:flex-[1_1_auto] space-y-2">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-72 w-full rounded-xl" />
            </div>
            <div className="flex-[5_0_500px] min-w-0 max-md:flex-[1_1_auto] space-y-2">
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-14 rounded-full" />
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

  if (!isSubmissionFresh) {
    const isNotFound = !error || (error instanceof ApiResponseError && error.status === 404);

    return isNotFound ? (
      <PageErrorState
        tone="neutral"
        icon={SearchRemoveIcon}
        title={t("detail.notFoundTitle")}
        description={t("detail.notFoundDescription")}
        action={<BackToSubmissionsButton variant="default" />}
      />
    ) : (
      <PageErrorState onRetry={() => refetch()} isRetrying={isFetching} action={<BackToSubmissionsButton variant="outline" />} />
    );
  }

  if (needsCurrentStation && !isCurrentStationFresh) {
    return (
      <PageErrorState
        title={t("stationDetails:page.stationUnavailableTitle")}
        description={t("common:error.tryLater")}
        onRetry={() => refetchCurrentStation()}
        isRetrying={isFetchingCurrentStation}
        action={<BackToSubmissionsButton variant="outline" />}
      />
    );
  }

  return <SubmissionDetailForm key={submission.id} submission={submission} initialStation={currentStation ?? null} />;
}

function SubmissionDetailForm({ submission, initialStation }: { submission: SubmissionDetail; initialStation: Station | null }) {
  const { t } = useTranslation(["submissions", "common"]);
  const queryClient = useQueryClient();
  const [currentStation] = useState(initialStation);

  const [reviewNotes, setReviewNotes] = useState(submission.review_notes ?? "");
  const initialUpdatedAt = useRef(submission.updatedAt);

  const { mutate: saveSubmission, isPending: isSaving } = useSaveSubmissionMutation();
  const { mutate: approveSubmission, isPending: isApproving } = useApproveSubmissionMutation();
  const { mutate: rejectSubmission, isPending: isRejecting } = useRejectSubmissionMutation();

  const [initialStationValues] = useState(() =>
    applyProposedStation(currentStation ? toStationValues(currentStation) : EMPTY_STATION_VALUES, submission.proposedStation),
  );

  const [stationForm, setStationForm] = useState<{
    station_id: string;
    operator_id: number | null;
    notes: string;
  }>(() => ({
    station_id: initialStationValues.station_id,
    operator_id: initialStationValues.operator_id,
    notes: initialStationValues.notes,
  }));

  const [extraForm, setExtraForm] = useState<{
    networks_id: number | null;
    networks_name: string;
    mno_name: string;
  }>(() => ({
    networks_id: initialStationValues.networks_id,
    networks_name: initialStationValues.networks_name,
    mno_name: initialStationValues.mno_name,
  }));

  const [uplinkForm, setUplinkForm] = useState<{
    uplink_type: UplinkType | null;
    uplink_speed: number | null;
    uplink_model: string;
  }>(() => ({
    uplink_type: initialStationValues.uplink_type,
    uplink_speed: initialStationValues.uplink_speed,
    uplink_model: initialStationValues.uplink_model,
  }));

  const isReadOnly = submission.status !== "pending";
  const isDeleteSubmission = submission.type === "delete";
  const isFormDisabled = isReadOnly || isDeleteSubmission;

  const [locationForm, setLocationForm] = useState<ProposedLocationForm>(() =>
    applyProposedLocation(toLocationValues(currentStation?.location ?? null), submission.proposedLocation),
  );
  const handleLocationFormChange = useCallback((patch: Partial<ProposedLocationForm>) => setLocationForm((prev) => ({ ...prev, ...patch })), []);

  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { data: allBands = [] } = useQuery(bandsQueryOptions());
  const selectedOperator = useMemo(() => operators.find((operator) => operator.id === stationForm.operator_id), [operators, stationForm.operator_id]);
  const originalSectors = useMemo(() => toSectorDrafts(currentStation?.sectors), [currentStation]);
  const [sectors, setSectors] = useState<SectorDraft[]>(() =>
    isReadOnly ? proposedSectorDrafts(submission.sectors) : applyProposedSectors(originalSectors, submission.sectors),
  );

  const initialCells = useMemo(() => computeInitialCells(submission, currentStation), [submission, currentStation]);

  const createNewSubmissionCell = useCallback(
    (rat: string, defaultBand: Band): LocalCell => ({
      _localId: nanoid(),
      operation: "add",
      target_cell_id: null,
      rat: rat as (typeof RAT_ORDER)[number],
      band_id: defaultBand.id,
      type: DEFAULT_CELL_TYPE,
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
    visibleRats,
    toggleRat: handleToggleRat,
    changeCell: handleCellChange,
    syncMissingSectorsByPCIInRat: handleSyncMissingSectorsByPCIInRat,
    addCell: handleAddCell,
    addRemainingLteCells: handleAddRemainingLteCells,
    cloneCell: handleCloneCell,
    clonedIds,
    deleteCell: handleDeleteCell,
  } = useCellDrafts<LocalCell>({
    initialCells,
    allBands,
    createNewCell: createNewSubmissionCell,
    disabled: isFormDisabled,
    operatorMnc: selectedOperator?.mnc ?? null,
  });

  const [savedForm, setSavedForm] = useState(() => ({ stationForm, extraForm, uplinkForm, locationForm, sectors, cells: localCells }));
  const hasUnsavedChanges =
    !shallowEqual(stationForm, savedForm.stationForm) ||
    !shallowEqual(extraForm, savedForm.extraForm) ||
    !shallowEqual(uplinkForm, savedForm.uplinkForm) ||
    !shallowEqual(locationForm, savedForm.locationForm) ||
    haveSectorsChanged(sectors, savedForm.sectors) ||
    haveCellsChanged(localCells, savedForm.cells);

  const isProcessing = isSaving || isApproving || isRejecting;

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

  const handleSave = useCallback(() => {
    const stationValues = { ...stationForm, ...extraForm, ...uplinkForm };
    const { sectors: orderedSectors, localIdMap } = orderSectorsById(sectors);
    const cells = localCells.map((cell): LocalCell => {
      const sectorLocalId = remapSectorAssignment(cell._sectorLocalId, localIdMap);
      if (sectorLocalId === cell._sectorLocalId) return cell;
      return { ...cell, _sectorLocalId: sectorLocalId, operation: cell.operation === "unchanged" ? "update" : cell.operation };
    });
    saveSubmission(
      {
        submissionId: submission.id,
        reviewNotes,
        station:
          submission.type === "update" && currentStation
            ? diffStationValues(stationValues, toStationValues(currentStation))
            : toStationPayload(stationValues),
        location:
          submission.type === "update" && currentStation
            ? diffLocationValues(locationForm, toLocationValues(currentStation.location))
            : toLocationPayload(locationForm),
        sectors: computeSectorPayloads(originalSectors, orderedSectors),
        localCells: cells,
      },
      {
        onSuccess: (response) => {
          const updatedAt = (response as { data?: { updatedAt?: string } })?.data?.updatedAt;
          if (updatedAt) initialUpdatedAt.current = updatedAt;
          setSavedForm({ stationForm, extraForm, uplinkForm, locationForm, sectors, cells: localCells });
          toast.success(t("toast.saved"));
        },
        onError: (error) => showApiError(error),
      },
    );
  }, [
    currentStation,
    extraForm,
    localCells,
    locationForm,
    originalSectors,
    reviewNotes,
    saveSubmission,
    sectors,
    stationForm,
    submission.id,
    submission.type,
    t,
    uplinkForm,
  ]);

  useSaveShortcut({
    canSave: !isReadOnly && !isProcessing,
    onSave: handleSave,
  });

  const handleApprove = useCallback(async () => {
    if (await checkStaleness()) return;
    approveSubmission(
      { submissionId: submission.id, reviewNotes, stationId: submission.station?.id ?? null },
      {
        onSuccess: () => {
          toast.success(t("toast.approved"));
          window.history.back();
        },
        onError: (error) => showApiError(error),
      },
    );
  }, [approveSubmission, checkStaleness, reviewNotes, submission.id, submission.station?.id, t]);

  const handleReject = useCallback(async () => {
    if (await checkStaleness()) return;
    rejectSubmission(
      { submissionId: submission.id, reviewNotes },
      {
        onSuccess: () => {
          toast.success(t("toast.rejected"));
          window.history.back();
        },
        onError: (error) => showApiError(error),
      },
    );
  }, [checkStaleness, rejectSubmission, reviewNotes, submission.id, t]);

  const currentOperatorId = submission.station?.operator_id ?? null;
  const currentOperator = useMemo(
    () => (currentOperatorId !== null ? (operators.find((o) => o.id === currentOperatorId) ?? null) : null),
    [operators, currentOperatorId],
  );

  const stationDiffs = useMemo(() => {
    if (submission.type !== "update" || !submission.station || !submission.proposedStation) return null;
    const current = toStationValues(submission.station);
    const proposed = applyProposedStation(current, submission.proposedStation);
    return {
      station_id: proposed.station_id !== current.station_id,
      operator_id: proposed.operator_id !== current.operator_id,
      notes: proposed.notes !== current.notes,
    };
  }, [submission]);

  const locationDiffs = useMemo(() => {
    if (submission.type !== "update" || !currentStation?.location || !submission.proposedLocation) return null;
    const current = toLocationValues(currentStation.location);
    const proposed = applyProposedLocation(current, submission.proposedLocation);
    return {
      coords: proposed.latitude !== current.latitude || proposed.longitude !== current.longitude,
      city: proposed.city !== current.city,
      address: proposed.address !== current.address,
      region: proposed.region_id !== current.region_id,
    };
  }, [submission, currentStation]);

  const currentCellsMap = useMemo(() => {
    if (!currentStation?.cells) return new Map<number, Cell>();
    return new Map(currentStation.cells.map((c) => [c.id, c]));
  }, [currentStation]);

  const currentSectorById = useMemo(() => {
    const map = new Map<number, Sector>();
    (currentStation?.sectors ?? []).forEach((sector) => map.set(sector.id, sector));
    return map;
  }, [currentStation]);

  const draftSectorByLocalId = useMemo(() => new Map(sectors.map((sector) => [sector._localId, sector] as const)), [sectors]);

  const draftSectorById = useMemo(() => {
    const map = new Map<number, SectorDraft>();
    sectors.forEach((sector) => {
      if (sector.id !== undefined) map.set(sector.id, sector);
    });
    return map;
  }, [sectors]);

  const oldSectorLabelById = useMemo(() => {
    const draftIndexById = new Map<number, number>();
    sectors.forEach((sector, index) => {
      if (sector.id !== undefined) draftIndexById.set(sector.id, index);
    });

    const map = new Map<number, string>();
    (currentStation?.sectors ?? []).forEach((sector, index) => {
      const displayIndex = draftIndexById.get(sector.id) ?? index;
      map.set(sector.id, `A${displayIndex + 1} (${sector.azimuth}°)`);
    });
    return map;
  }, [currentStation, sectors]);

  const getSubmissionDiffBadges = useCallback((_rat: string, cellsForRat: LocalCell[]) => countCellOperations(cellsForRat), []);

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
      const changedKeys = getChangedDetailKeys(details, cell.details);
      const targetSectorId = targetCell.sector_id ?? null;
      const assignedExistingSectorId = getAssignedExistingSectorId(cell._sectorLocalId, draftSectorByLocalId, targetSectorId);
      const sectorChanged =
        isSectorAssignmentChanged(cell._sectorLocalId, draftSectorByLocalId, targetSectorId) ||
        hasSectorAzimuthChanged(assignedExistingSectorId, currentSectorById, draftSectorById);

      return (
        <tr className="bg-amber-50/40 dark:bg-amber-950/15 border-b last:border-0">
          <td className="px-3 py-1 border-l-2 border-l-amber-400/60">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {t("diff.was")}
            </span>
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">{targetCell.band.value}</span>
          </td>
          {getRatShowsBandDuplex(targetCell.rat) && (
            <td className="px-3 py-1 font-mono text-xs text-muted-foreground">{targetCell.band.duplex ?? "-"}</td>
          )}
          {sectors.length > 0 && (
            <td className={cn("px-3 py-1 font-mono text-xs text-muted-foreground", sectorChanged && "text-amber-700 dark:text-amber-300")}>
              {targetSectorId !== null ? (oldSectorLabelById.get(targetSectorId) ?? "-") : "-"}
            </td>
          )}
          <SubmissionDiffDetailCells details={details} rat={targetCell.rat} changedKeys={changedKeys} />
          <td
            className={cn(
              "px-3 py-1 font-mono text-xs text-muted-foreground",
              (targetCell.type ?? null) !== (cell.type ?? null) && "text-amber-700 dark:text-amber-300",
            )}
          >
            {targetCell.type ? CELL_TYPE_LABELS[targetCell.type] : "-"}
          </td>
          <td className="px-3 py-1 font-mono text-xs text-muted-foreground truncate max-w-28">{targetCell.notes || "-"}</td>
          <td className="px-3 py-1" />
          <td className="px-3 py-1" />
        </tr>
      );
    },
    [currentCellsMap, currentSectorById, draftSectorById, draftSectorByLocalId, isReadOnly, oldSectorLabelById, sectors.length, t],
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col max-md:overflow-y-auto max-md:pb-10 md:overflow-hidden">
      <SubmissionDetailHeader
        submission={submission}
        currentStation={currentStation}
        operator={selectedOperator ?? currentOperator}
        isReadOnly={isReadOnly}
        isProcessing={isProcessing}
        hasUnsavedChanges={hasUnsavedChanges}
        onApprove={handleApprove}
        onReject={handleReject}
        onSave={handleSave}
      />

      <div className="max-md:shrink-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:pb-16">
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
              uplinkForm={uplinkForm}
              onUplinkFormChange={(patch) => setUplinkForm((prev) => ({ ...prev, ...patch }))}
              locationForm={locationForm}
              onLocationFormChange={handleLocationFormChange}
              sectors={sectors}
              onSectorsChange={setSectors}
              cells={localCells}
              operators={operators}
              selectedOperator={selectedOperator}
              currentOperator={currentOperator}
              currentStation={currentStation ?? null}
              stationDiffs={stationDiffs}
              locationDiffs={locationDiffs}
              isFormDisabled={isFormDisabled}
              isDeleteSubmission={isDeleteSubmission}
            />
            <SubmissionLocationPhotoSelectionsSection
              photos={submission.locationPhotoSelections}
              removalPhotos={submission.locationPhotoRemovalSelections}
            />
            <SubmissionPhotosSection submissionId={submission.id} readOnly={isReadOnly} pendingPhotos={submission.pending_photos ?? undefined} />
          </div>

          <div className="flex-[5_0_500px] min-w-0 max-md:flex-[1_1_auto] space-y-2">
            <CellsEditor
              cellsByRat={cellsByRat}
              enabledRats={enabledRats}
              visibleRats={visibleRats}
              bands={allBands}
              sectors={sectors}
              onToggleRat={handleToggleRat}
              onCellChange={handleCellChange}
              onSyncSectorsByPCIInRat={handleSyncMissingSectorsByPCIInRat}
              onAddCell={handleAddCell}
              onAddRemainingLteCells={handleAddRemainingLteCells}
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
              operatorMnc={selectedOperator?.mnc ?? null}
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
    mainClassName: "overflow-hidden max-md:pb-0",
    titleKey: "detail.title",
    i18nNamespace: "submissions",
    breadcrumbs: [
      { titleKey: "sections.admin", path: "/admin/stations", i18nNamespace: "nav" },
      { titleKey: "items.submissions", path: "/admin/submissions", i18nNamespace: "nav" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
