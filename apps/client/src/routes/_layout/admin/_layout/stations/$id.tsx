import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DiffBadges } from "@/features/admin/cells/cellsEditor";
import { CellsEditor } from "@/features/admin/cells/cellsEditor";
import { useCellDrafts } from "@/features/admin/cells/hooks/useCellDrafts";
import { RAT_ORDER, compareRatCellDetails } from "@/features/admin/cells/rat";
import { bandsQueryOptions, operatorsQueryOptions } from "@/features/admin/queries";
import { StationCommentsSection } from "@/features/admin/stations/components/stationCommentsSection";
import { StationDetailHeader } from "@/features/admin/stations/components/stationDetailHeader";
import { StationInfoForm } from "@/features/admin/stations/components/stationInfoForm";
import { StationPhotoSelector } from "@/features/admin/stations/components/StationPhotoSelector";
import { type LocalCell, isCellModified, useSaveStationMutation } from "@/features/admin/stations/mutations";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { groupPermitsByStation } from "@/features/map/utils";
import { uploadAndAssignStationPhotos } from "@/features/station-details/api";
import { PhotoUploadSection } from "@/features/submissions/components/photoUploadSection";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { findDuplicateCids, findDuplicateEnbidClids } from "@/features/submissions/utils/cellDuplicates";
import { ukePermitsToCells } from "@/features/submissions/utils/cells";
import { useSaveShortcut } from "@/hooks/useSaveShortcut";
import { useSettings } from "@/hooks/useSettings";
import { fetchApiData, showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { isRecent } from "@/lib/dateUtils";
import { shallowEqual } from "@/lib/shallowEqual";
import { type Band, type Cell, type SectorDraft, type Station, type StationStatus, type UkeStation } from "@/types/station";

function cellToLocal(cell: Cell): LocalCell {
  return {
    _localId: crypto.randomUUID(),
    _serverId: cell.id,
    _sectorLocalId: cell.sector_id ? `sector-${cell.sector_id}` : null,
    rat: cell.rat as (typeof RAT_ORDER)[number],
    band_id: cell.band.id,
    type: cell.type ?? null,
    is_confirmed: cell.is_confirmed,
    notes: cell.notes ?? "",
    details: { ...cell.details },
  };
}

function sortAndMapCells(cells: Cell[]): LocalCell[] {
  return [...cells]
    .sort((a, b) => {
      if (a.band.value !== b.band.value) return a.band.value - b.band.value;
      return compareRatCellDetails(a.rat, a.details, b.details);
    })
    .map(cellToLocal);
}

type CellDiffStatus = "added" | "modified" | "unchanged";

function getLocalCellDiffStatus(lc: LocalCell, originalCells: Cell[]): CellDiffStatus {
  if (!lc._serverId) return "added";
  if (!originalCells.some((c) => c.id === lc._serverId)) return "added";
  return isCellModified(lc, originalCells) ? "modified" : "unchanged";
}

function getDiffBorderClass(status: CellDiffStatus): string | undefined {
  if (status === "added") return "border-l-2 border-l-green-500";
  if (status === "modified") return "border-l-2 border-l-amber-500";
  return undefined;
}

function sectorsMatchDrafts(drafts: SectorDraft[], station: Station | undefined): boolean {
  const original = station?.sectors ?? [];
  if (drafts.length !== original.length) return false;
  return drafts.every((draft, index) => draft.azimuth === original[index]?.azimuth);
}

function AdminStationDetailPage() {
  const { id } = Route.useParams();
  const { uke } = Route.useSearch();
  const navigate = useNavigate();

  const isCreateMode = id === "new";

  const { data: station, isLoading } = useQuery({
    queryKey: ["admin", "station", id],
    queryFn: () => fetchApiData<Station>(`stations/${id}`),
    enabled: !!id && !isCreateMode,
  });

  const { t } = useTranslation("admin");

  if (!isCreateMode && isLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-background px-4 py-2.5 flex items-center justify-between gap-4">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-7 w-40 rounded-md" />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="w-full lg:flex-2">
              <Skeleton className="h-52 w-full rounded-xl" />
            </div>
            <div className="w-full lg:flex-3 space-y-3">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isCreateMode && !station) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{t("common:error.description")}</p>
          <Button variant="outline" onClick={() => navigate({ to: "/admin/stations" })}>
            {t("common:actions.back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <StationDetailForm
      key={station?.id ?? "new"}
      station={station}
      isCreateMode={isCreateMode}
      preloadUkeStationId={isCreateMode ? uke : undefined}
    />
  );
}

const emptyLocation: ProposedLocationForm = {
  region_id: null,
  city: "",
  address: "",
  longitude: null,
  latitude: null,
};

function getInitialFormState(station: Station | undefined): {
  stationId: string;
  operatorId: number | null;
  notes: string;
  extraAddress: string;
  isConfirmed: boolean;
  location: ProposedLocationForm;
  existingLocationId: number | null;
  deletedServerCellIds: number[];
  networksId: number | null;
  networksName: string;
  mnoName: string;
  stationStatus: StationStatus;
} {
  return {
    stationId: station?.station_id ?? "",
    operatorId: station?.operator?.id ?? null,
    notes: station?.notes ?? "",
    extraAddress: station?.extra_address ?? "",
    isConfirmed: station?.is_confirmed ?? false,
    location: station?.location
      ? {
          region_id: station.location.region?.id ?? null,
          city: station.location.city ?? "",
          address: station.location.address ?? "",
          longitude: station.location.longitude ?? null,
          latitude: station.location.latitude ?? null,
        }
      : { ...emptyLocation },
    existingLocationId: station?.location?.id ?? null,
    deletedServerCellIds: [],
    networksId: station?.extra_identificators?.networks_id ?? null,
    networksName: station?.extra_identificators?.networks_name ?? "",
    mnoName: station?.extra_identificators?.mno_name ?? "",
    stationStatus: station?.status ?? "pending",
  };
}

type FormAction =
  | { type: "SET_STATION_ID"; payload: string }
  | { type: "SET_OPERATOR_ID"; payload: number | null }
  | { type: "SET_NOTES"; payload: string }
  | { type: "SET_EXTRA_ADDRESS"; payload: string }
  | { type: "SET_CONFIRMED"; payload: boolean }
  | { type: "PATCH_LOCATION"; payload: Partial<ProposedLocationForm> }
  | { type: "SET_LOCATION"; payload: ProposedLocationForm }
  | { type: "SET_EXISTING_LOCATION"; payload: { id: number; location: ProposedLocationForm } }
  | { type: "ADD_DELETED_ID"; payload: number }
  | { type: "CLEAR_DELETED" }
  | { type: "RESET_CREATE" }
  | { type: "LOAD_STATION"; payload: Station }
  | { type: "SET_NETWORKS_ID"; payload: number | null }
  | { type: "SET_NETWORKS_NAME"; payload: string }
  | { type: "SET_MNO_NAME"; payload: string }
  | { type: "SET_STATUS"; payload: StationStatus };

function formReducer(state: ReturnType<typeof getInitialFormState>, action: FormAction): ReturnType<typeof getInitialFormState> {
  switch (action.type) {
    case "SET_STATION_ID":
      return { ...state, stationId: action.payload };
    case "SET_OPERATOR_ID":
      return { ...state, operatorId: action.payload };
    case "SET_NOTES":
      return { ...state, notes: action.payload };
    case "SET_EXTRA_ADDRESS":
      return { ...state, extraAddress: action.payload };
    case "SET_CONFIRMED":
      return { ...state, isConfirmed: action.payload };
    case "PATCH_LOCATION":
      return { ...state, location: { ...state.location, ...action.payload } };
    case "SET_LOCATION":
      return { ...state, location: action.payload, existingLocationId: null };
    case "SET_EXISTING_LOCATION":
      return { ...state, location: action.payload.location, existingLocationId: action.payload.id };
    case "ADD_DELETED_ID":
      return { ...state, deletedServerCellIds: [...state.deletedServerCellIds, action.payload] };
    case "CLEAR_DELETED":
      return { ...state, deletedServerCellIds: [] };
    case "RESET_CREATE":
      return { ...getInitialFormState(undefined), location: { ...emptyLocation } };
    case "LOAD_STATION":
      return getInitialFormState(action.payload);
    case "SET_NETWORKS_ID":
      return { ...state, networksId: action.payload };
    case "SET_NETWORKS_NAME":
      return { ...state, networksName: action.payload };
    case "SET_MNO_NAME":
      return { ...state, mnoName: action.payload };
    case "SET_STATUS":
      return { ...state, stationStatus: action.payload };
    default:
      return state;
  }
}

function StationDetailForm({
  station,
  isCreateMode,
  preloadUkeStationId,
}: {
  station: Station | undefined;
  isCreateMode: boolean;
  preloadUkeStationId?: string;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("stations");
  const queryClient = useQueryClient();

  const [formState, dispatch] = useReducer(formReducer, station, getInitialFormState);
  const {
    stationId,
    operatorId,
    notes,
    extraAddress,
    isConfirmed,
    location,
    existingLocationId,
    deletedServerCellIds,
    networksId,
    networksName,
    mnoName,
    stationStatus,
  } = formState;

  const { data: settings } = useSettings();
  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { data: allBands = [] } = useQuery(bandsQueryOptions());
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const areCellActionsLocked = !isCreateMode && station?.status !== "published";

  const [photos, setPhotos] = useState<File[]>([]);
  const [photoNotes, setPhotoNotes] = useState<string[]>([]);
  const [photoTakenAts, setPhotoTakenAts] = useState<(Date | null)[]>([]);
  const [sectors, setSectors] = useState<SectorDraft[]>(() =>
    (station?.sectors ?? []).map((sector) => ({ ...sector, _localId: `sector-${sector.id}` })),
  );

  const saveMutation = useSaveStationMutation();
  const handleServerCellDelete = useCallback((cell: LocalCell) => {
    if (cell._serverId) dispatch({ type: "ADD_DELETED_ID", payload: cell._serverId });
  }, []);

  const createNewStationCell = useCallback(
    (rat: string, defaultBand: Band): LocalCell => ({
      _localId: crypto.randomUUID(),
      _sectorLocalId: null,
      rat: rat as (typeof RAT_ORDER)[number],
      band_id: defaultBand.id,
      type: null,
      is_confirmed: isAdmin ?? false,
      notes: "",
      details: {},
    }),
    [isAdmin],
  );

  const {
    cells: localCells,
    setCells: setLocalCells,
    cellsByRat,
    enabledRats,
    setEnabledRats,
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
    initialCells: sortAndMapCells(station?.cells ?? []),
    allBands,
    createNewCell: createNewStationCell,
    onDelete: handleServerCellDelete,
    sortCellsByRat: false,
    disabled: areCellActionsLocked,
  });

  const handleSectorsChange = useCallback(
    (nextSectors: SectorDraft[]) => {
      const nextSectorIds = new Set(nextSectors.map((sector) => sector._localId));
      setSectors(nextSectors);
      setLocalCells((prev) =>
        prev.map((cell) => (cell._sectorLocalId && !nextSectorIds.has(cell._sectorLocalId) ? { ...cell, _sectorLocalId: null } : cell)),
      );
    },
    [setLocalCells],
  );

  const handleLocationChange = useCallback((patch: Partial<ProposedLocationForm>) => {
    dispatch({ type: "PATCH_LOCATION", payload: patch });
  }, []);

  const handleExistingLocationSelect = useCallback(
    (loc: { id: number; latitude: number; longitude: number; city?: string | null; address?: string | null; region?: { id: number } | null }) => {
      dispatch({
        type: "SET_EXISTING_LOCATION",
        payload: {
          id: loc.id,
          location: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            city: loc.city ?? "",
            address: loc.address ?? "",
            region_id: loc.region?.id ?? null,
          },
        },
      });
    },
    [],
  );

  const handleUkeStationSelect = useCallback(
    (ukeStation: UkeStation) => {
      dispatch({ type: "SET_STATION_ID", payload: ukeStation.station_id });
      dispatch({ type: "SET_OPERATOR_ID", payload: ukeStation.operator?.id ?? null });

      if (ukeStation.location) {
        dispatch({
          type: "SET_LOCATION",
          payload: {
            latitude: ukeStation.location.latitude,
            longitude: ukeStation.location.longitude,
            city: ukeStation.location.city ?? "",
            address: ukeStation.location.address ?? "",
            region_id: ukeStation.location.region?.id ?? null,
          },
        });
      }

      const newCells: LocalCell[] = ukePermitsToCells(ukeStation.permits).map((cell) => ({
        _localId: cell.id,
        _sectorLocalId: null,
        rat: cell.rat,
        band_id: cell.band_id!,
        type: null,
        is_confirmed: false,
        notes: "",
        details: {},
      }));
      setLocalCells(newCells);
      setEnabledRats([...new Set(newCells.map((c) => c.rat))]);
      dispatch({ type: "CLEAR_DELETED" });
    },
    [setLocalCells, setEnabledRats],
  );

  const { data: preloadUkePermits } = useQuery({
    queryKey: ["uke-permits-preload", preloadUkeStationId],
    queryFn: () => fetchUkePermitsByStationId(preloadUkeStationId!),
    enabled: !!preloadUkeStationId && isCreateMode,
    staleTime: 1000 * 60 * 5,
  });

  const hasAppliedUkePreload = useRef(false);

  useEffect(() => {
    if (!preloadUkePermits?.length || hasAppliedUkePreload.current) return;
    const station = groupPermitsByStation(preloadUkePermits)[0];
    if (station) {
      hasAppliedUkePreload.current = true;
      handleUkeStationSelect(station);
    }
  }, [preloadUkePermits, preloadUkeStationId, handleUkeStationSelect]);

  const handleSaveStation = () => {
    if (isCreateMode) {
      if (!stationId.trim()) {
        toast.error(t("toast.stationIdRquired"));
        return;
      }
      if (!operatorId) {
        toast.error(t("toast.operatorRequired"));
        return;
      }
      if (location.longitude === null || location.latitude === null || location.region_id === null) {
        toast.error(t("toast.locationRequired"));
        return;
      }
    }

    if (hasGenericAddressMarker(location.address)) {
      toast.error(t("toast.addressOwnWordForbidden"));
      return;
    }

    const cellLikes = localCells.map((c) => ({ id: c._localId, rat: c.rat, details: c.details }));

    const cidDuplicates = findDuplicateCids(cellLikes);
    if (cidDuplicates.length > 0) {
      toast.error(t("toast.duplicateCid", { rat: cidDuplicates[0][0] }));
      return;
    }

    if (findDuplicateEnbidClids(cellLikes).length > 0) {
      toast.error(t("toast.duplicateEnbidClid"));
      return;
    }

    if (sectors.some((sector) => sector.azimuth === "")) {
      toast.error(t("toast.sectorAzimuthsRequired"));
      return;
    }

    saveMutation.mutate(
      {
        isCreateMode,
        stationId,
        operatorId,
        notes,
        extraAddress,
        isConfirmed,
        location,
        existingLocationId,
        localCells,
        sectors,
        deletedServerCellIds,
        originalStation: station,
        networksId: networksId ?? undefined,
        networksName: networksName || undefined,
        mnoName: mnoName || undefined,
        skipExtraIds: false,
        stationStatus,
      },
      {
        onSuccess: async (result) => {
          if (result.mode === "create") {
            const resultLocationId = result.station.location?.id;
            if (photos.length > 0 && resultLocationId) {
              await uploadAndAssignStationPhotos({
                locationId: resultLocationId,
                stationId: result.station.id,
                files: photos,
                selected: [],
                mainId: null,
                useFirstUploadedAsMain: true,
              }).catch(() => {
                toast.error(t("toast.photoUploadFailed"));
              });
            }
            toast.success(t("toast.created"));
            void navigate({ to: `/admin/stations/${result.station.id}`, replace: true });
          } else {
            toast.success(t("toast.saved"));
            dispatch({ type: "CLEAR_DELETED" });
            const fresh = await queryClient.fetchQuery<Station>({
              queryKey: ["admin", "station", String(result.stationId)],
            });
            setLocalCells(sortAndMapCells(fresh.cells));
            const freshRats = new Set(fresh.cells.map((c) => c.rat));
            setEnabledRats(RAT_ORDER.filter((r) => freshRats.has(r)));
            setSectors((fresh.sectors ?? []).map((sector) => ({ ...sector, _localId: `sector-${sector.id}` })));
          }
        },
        onError: (error) => {
          showApiError(error);
        },
      },
    );
  };

  const handleRevert = () => {
    if (isCreateMode) {
      dispatch({ type: "RESET_CREATE" });
      setEnabledRats([]);
      setLocalCells([]);
      setSectors([]);
      return;
    }
    if (!station) return;
    dispatch({ type: "LOAD_STATION", payload: station });
    const existingRats = new Set(station.cells.map((c) => c.rat));
    setEnabledRats(RAT_ORDER.filter((r) => existingRats.has(r)));
    setLocalCells(sortAndMapCells(station.cells));
    setSectors((station.sectors ?? []).map((sector) => ({ ...sector, _localId: `sector-${sector.id}` })));
  };

  const selectedOperator = useMemo(() => operators.find((o) => o.id === operatorId), [operators, operatorId]);

  const originalCells = useMemo(() => station?.cells ?? [], [station]);
  const originalCellsById = useMemo(() => new Map(originalCells.map((cell) => [cell.id, cell])), [originalCells]);
  const deletedServerCellIdSet = useMemo(() => new Set(deletedServerCellIds), [deletedServerCellIds]);

  const hasChanges = useMemo(() => {
    if (isCreateMode) return true;
    if (!station) return false;

    const initial = getInitialFormState(station);
    if (stationId !== initial.stationId) return true;
    if (operatorId !== initial.operatorId) return true;
    if (notes !== initial.notes) return true;
    if (extraAddress !== initial.extraAddress) return true;
    if (isConfirmed !== initial.isConfirmed) return true;
    if (!shallowEqual(location as unknown as Record<string, unknown>, initial.location as unknown as Record<string, unknown>)) return true;
    if (deletedServerCellIds.length > 0) return true;
    if (localCells.length !== originalCells.length) return true;
    if (networksId !== initial.networksId) return true;
    if (networksName !== initial.networksName) return true;
    if (mnoName !== initial.mnoName) return true;
    if (stationStatus !== initial.stationStatus) return true;
    if (!sectorsMatchDrafts(sectors, station)) return true;
    for (const lc of localCells) {
      if (getLocalCellDiffStatus(lc, originalCells) !== "unchanged") return true;
    }
    return false;
  }, [
    isCreateMode,
    station,
    stationId,
    operatorId,
    notes,
    extraAddress,
    isConfirmed,
    location,
    deletedServerCellIds,
    localCells,
    originalCells,
    networksId,
    networksName,
    mnoName,
    stationStatus,
    sectors,
  ]);

  useSaveShortcut({
    canSave: hasChanges && !saveMutation.isPending,
    onSave: handleSaveStation,
  });

  const getStationDiffBadges = useCallback(
    (rat: string, cellsForRat: LocalCell[]): DiffBadges => {
      let added = 0;
      let modified = 0;
      for (const lc of cellsForRat) {
        const status = getLocalCellDiffStatus(lc, originalCells);
        if (status === "added") added++;
        else if (status === "modified") modified++;
      }
      let deleted = 0;
      for (const cell of originalCells) {
        if (cell.rat === rat && deletedServerCellIdSet.has(cell.id)) deleted++;
      }
      return { added, modified, deleted };
    },
    [originalCells, deletedServerCellIdSet],
  );

  const getStationCellProps = useCallback(
    (cell: LocalCell) => {
      const diffStatus = getLocalCellDiffStatus(cell, originalCells);
      let rowClassName: string | undefined;
      if (diffStatus === "unchanged" && cell._serverId) {
        const original = originalCellsById.get(cell._serverId);
        if (original) {
          const isNew = isRecent(original.createdAt);
          if (isNew) rowClassName = "bg-green-500/5";
          else if (isRecent(original.updatedAt)) rowClassName = "bg-amber-500/5";
        }
      }
      return {
        leftBorderClass: getDiffBorderClass(diffStatus),
        rowClassName,
        disabled: areCellActionsLocked,
        showDelete: !areCellActionsLocked,
      };
    },
    [areCellActionsLocked, originalCells, originalCellsById],
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col max-md:overflow-y-auto max-md:pb-10 md:overflow-hidden">
      <StationDetailHeader
        station={station}
        stationId={stationId}
        isCreateMode={isCreateMode}
        selectedOperator={selectedOperator}
        isSaving={saveMutation.isPending}
        hasChanges={hasChanges}
        onSave={handleSaveStation}
        onRevert={handleRevert}
      />

      {station?.status === "pending" && (
        <div className="shrink-0 flex items-center gap-2.5 border-b border-yellow-600/30 bg-yellow-300/15 px-4 py-2 text-sm text-yellow-800 dark:border-yellow-400/30 dark:bg-yellow-400/12 dark:text-yellow-300">
          <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" />
          <span className="font-medium">{t("pendingBanner.title")}</span>
          <span className="text-yellow-800/55 dark:text-yellow-300/55 select-none" aria-hidden>
            ·
          </span>
          <span className="text-yellow-800/85 dark:text-yellow-300/80">{t("pendingBanner.description")}</span>
        </div>
      )}

      {station?.status === "inactive" && (
        <div className="shrink-0 flex items-center gap-2.5 border-b border-red-600/30 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:border-red-400/35 dark:bg-red-400/12 dark:text-red-300">
          <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" />
          <span className="font-medium">{t("inactiveBanner.title")}</span>
          <span className="text-red-700/55 dark:text-red-300/55 select-none" aria-hidden>
            ·
          </span>
          <span className="text-red-700/85 dark:text-red-300/80">{t("inactiveBanner.description")}</span>
        </div>
      )}

      <div className="max-md:shrink-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:pb-16">
        <div className="flex flex-wrap gap-3 p-3">
          <div className="flex-[2_0_420px] min-w-0 max-md:flex-[1_1_auto] space-y-2">
            <StationInfoForm
              stationDbId={station?.id}
              stationId={stationId}
              onStationIdChange={(v) => dispatch({ type: "SET_STATION_ID", payload: v })}
              operatorId={operatorId}
              onOperatorIdChange={(v) => dispatch({ type: "SET_OPERATOR_ID", payload: v })}
              notes={notes}
              onNotesChange={(v) => dispatch({ type: "SET_NOTES", payload: v })}
              {...(!isCreateMode && { extraAddress, onExtraAddressChange: (v: string) => dispatch({ type: "SET_EXTRA_ADDRESS", payload: v }) })}
              isConfirmed={isConfirmed}
              onIsConfirmedChange={(v) => dispatch({ type: "SET_CONFIRMED", payload: v })}
              status={!isCreateMode ? stationStatus : undefined}
              onStatusChange={!isCreateMode ? (v) => dispatch({ type: "SET_STATUS", payload: v }) : undefined}
              location={location}
              onLocationChange={handleLocationChange}
              onExistingLocationSelect={handleExistingLocationSelect}
              operators={operators}
              selectedOperator={selectedOperator}
              onUkeStationSelect={handleUkeStationSelect}
              networksId={networksId}
              onNetworksIdChange={(v) => dispatch({ type: "SET_NETWORKS_ID", payload: v ?? null })}
              networksName={networksName}
              onNetworksNameChange={(v) => dispatch({ type: "SET_NETWORKS_NAME", payload: v })}
              mnoName={mnoName}
              onMnoNameChange={(v) => dispatch({ type: "SET_MNO_NAME", payload: v })}
              currentLocation={station?.location ?? null}
              showEditLocationLink={!isCreateMode}
              sectors={sectors}
              onSectorsChange={handleSectorsChange}
              cells={localCells}
            />

            {isCreateMode ? (
              <PhotoUploadSection
                photos={photos}
                onPhotosChange={setPhotos}
                notes={photoNotes}
                onNotesChange={setPhotoNotes}
                takenAts={photoTakenAts}
                onTakenAtsChange={setPhotoTakenAts}
              />
            ) : (
              !!station?.location?.id && <StationPhotoSelector stationId={station.id} locationId={station.location.id} />
            )}
            {!isCreateMode && station && settings?.enableStationComments && <StationCommentsSection stationId={station.id} />}
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
              onCloneCell={handleCloneCell}
              clonedIds={clonedIds}
              onDeleteCell={handleDeleteCell}
              getDiffBadges={getStationDiffBadges}
              getCellProps={getStationCellProps}
              operatorMnc={selectedOperator?.mnc ?? null}
              readOnly={areCellActionsLocked}
              readOnlyPlaceholder={t("cells.pendingReadOnly")}
              ratPillsDisabled={areCellActionsLocked}
              showAddButton={!areCellActionsLocked}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/stations/$id")({
  component: AdminStationDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    uke: typeof search.uke === "string" || typeof search.uke === "number" ? String(search.uke) : undefined,
  }),
  staticData: {
    mainClassName: "overflow-hidden max-md:pb-0",
    titleKey: "breadcrumbs.editStation",
    i18nNamespace: "admin",
    breadcrumbs: [
      { titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" },
      { titleKey: "breadcrumbs.stations", path: "/admin/stations", i18nNamespace: "admin" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
