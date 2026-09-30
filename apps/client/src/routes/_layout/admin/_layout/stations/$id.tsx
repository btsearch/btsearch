import { Alert02Icon, ArrowLeft01Icon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { trackPhotoUpload } from "@/components/photos/photoUploadToast";
import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { DiffBadges } from "@/features/admin/cells/cellsEditor";
import { CellsEditor } from "@/features/admin/cells/cellsEditor";
import { useCellDrafts } from "@/features/admin/cells/hooks/useCellDrafts";
import { RAT_ORDER, compareRatCells } from "@/features/admin/cells/rat";
import { bandsQueryOptions, operatorsQueryOptions } from "@/features/admin/queries";
import { StationCommentsSection } from "@/features/admin/stations/components/stationCommentsSection";
import { StationDetailHeader } from "@/features/admin/stations/components/stationDetailHeader";
import { StationInfoForm } from "@/features/admin/stations/components/stationInfoForm";
import { StationPhotoSelector } from "@/features/admin/stations/components/StationPhotoSelector";
import { type ExistingLocation, type LocalCell, isCellModified, sectorsChanged, useSaveStationMutation } from "@/features/admin/stations/mutations";
import { adminStationQueryOptions } from "@/features/admin/stations/queries";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { groupPermitsByStation } from "@/features/map/utils";
import { DEFAULT_CELL_TYPE } from "@/features/shared/cellTypes";
import { useSectorPanelState } from "@/features/shared/sectorPanelState";
import { uploadAndAssignStationPhotos } from "@/features/station-details/api";
import { PhotoUploadSection } from "@/features/submissions/components/photoUploadSection";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { findDuplicateCids, findDuplicateEnbidClids } from "@/features/submissions/utils/cellDuplicates";
import { ukePermitsToCells } from "@/features/submissions/utils/cells";
import { toSectorDrafts } from "@/features/submissions/utils/proposalChanges";
import { useSaveShortcut } from "@/hooks/useSaveShortcut";
import { useSettings } from "@/hooks/useSettings";
import { ApiResponseError, showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { isRecent } from "@/lib/dateUtils";
import { shallowEqual } from "@/lib/shallowEqual";
import { type Band, type Cell, type SectorDraft, type Station, type StationStatus, type UkeStation, type UplinkType } from "@/types/station";

function cellToLocal(cell: Cell): LocalCell {
  return {
    _localId: nanoid(),
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
      const ratOrder = RAT_ORDER.findIndex((rat) => rat === a.rat) - RAT_ORDER.findIndex((rat) => rat === b.rat);
      if (ratOrder !== 0) return ratOrder;
      return compareRatCells(a.rat, a.band.value, a.details, b.band.value, b.details);
    })
    .map(cellToLocal);
}

type CellDiffStatus = "added" | "modified" | "unchanged";

function getLocalCellDiffStatus(lc: LocalCell, originalCells: Cell[]): CellDiffStatus {
  if (!lc._serverId || !originalCells.some((c) => c.id === lc._serverId)) return "added";
  return isCellModified(lc, originalCells) ? "modified" : "unchanged";
}

function getDiffBorderClass(status: CellDiffStatus): string | undefined {
  if (status === "added") return "border-l-2 border-l-green-500";
  if (status === "modified") return "border-l-2 border-l-amber-500";
  return undefined;
}

function getRecentCellRowClass(cell: Cell): string | undefined {
  if (isRecent(cell.createdAt)) return "bg-green-500/5";
  if (isRecent(cell.updatedAt)) return "bg-amber-500/5";
  return undefined;
}

function AdminStationDetailPage() {
  const { id } = Route.useParams();
  const { uke } = Route.useSearch();
  const [mountedAt] = useState(Date.now);

  const isCreateMode = id === "new";

  const {
    data: station,
    dataUpdatedAt,
    error,
    isFetching,
    isFetchedAfterMount,
    refetch,
  } = useQuery({
    ...adminStationQueryOptions(id),
    enabled: !!id && !isCreateMode,
    staleTime: 0,
  });

  const { t } = useTranslation("admin");
  const isStationFresh = station !== undefined && dataUpdatedAt >= mountedAt;

  if (!isCreateMode && !isStationFresh && !isFetchedAfterMount) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-background">
          <div className="px-4 py-2">
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
          <div className="flex items-center gap-3 border-t border-border/50 px-4 py-2.5">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-5 w-56 max-w-full rounded-md" />
              <Skeleton className="h-4 w-96 max-w-full rounded-md" />
            </div>
            <Skeleton className="h-6 w-40 rounded-md max-md:w-14" />
          </div>
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

  if (!isCreateMode && !isStationFresh) {
    const isNotFound = !error || (error instanceof ApiResponseError && error.status === 404);
    const backButton = (
      <Button variant={isNotFound ? "default" : "outline"} nativeButton={false} render={<Link to="/admin/stations" />}>
        <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
        {t("common:actions.back")}
      </Button>
    );

    return isNotFound ? (
      <PageErrorState
        tone="neutral"
        icon={SearchRemoveIcon}
        title={t("stationDetails:page.stationNotFoundTitle")}
        description={t("stationDetails:page.stationNotFoundDescription")}
        action={backButton}
      />
    ) : (
      <PageErrorState
        title={t("stationDetails:page.stationUnavailableTitle")}
        description={t("common:error.tryLater")}
        onRetry={() => refetch()}
        isRetrying={isFetching}
        action={backButton}
      />
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

type StationFormState = {
  stationId: string;
  operatorId: number | null;
  notes: string;
  extraAddress: string;
  isConfirmed: boolean;
  location: ProposedLocationForm;
  existingLocation: ExistingLocation | null;
  deletedServerCellIds: number[];
  networksId: number | null;
  networksName: string;
  mnoName: string;
  stationStatus: StationStatus;
  uplinkType: UplinkType | null;
  uplinkSpeed: number | null;
  uplinkModel: string;
};

function getInitialFormState(station: Station | undefined): StationFormState {
  const location: ProposedLocationForm = station?.location
    ? {
        region_id: station.location.region?.id ?? null,
        city: station.location.city ?? "",
        address: station.location.address ?? "",
        longitude: station.location.longitude ?? null,
        latitude: station.location.latitude ?? null,
      }
    : { ...emptyLocation };

  return {
    stationId: station?.station_id ?? "",
    operatorId: station?.operator?.id ?? null,
    notes: station?.notes ?? "",
    extraAddress: station?.extra_address ?? "",
    isConfirmed: station?.is_confirmed ?? false,
    location,
    existingLocation: station?.location ? { ...location, id: station.location.id } : null,
    deletedServerCellIds: [],
    networksId: station?.extra_identificators?.networks_id ?? null,
    networksName: station?.extra_identificators?.networks_name ?? "",
    mnoName: station?.extra_identificators?.mno_name ?? "",
    stationStatus: station?.status ?? "pending",
    uplinkType: station?.uplink?.type ?? null,
    uplinkSpeed: station?.uplink?.speed ?? null,
    uplinkModel: station?.uplink?.model ?? "",
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
  | { type: "SET_STATUS"; payload: StationStatus }
  | { type: "SET_UPLINK_TYPE"; payload: UplinkType | null }
  | { type: "SET_UPLINK_SPEED"; payload: number | null }
  | { type: "SET_UPLINK_MODEL"; payload: string };

function formReducer(state: StationFormState, action: FormAction): StationFormState {
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
    case "PATCH_LOCATION": {
      const location = { ...state.location, ...action.payload };
      const coordsChanged = location.latitude !== state.location.latitude || location.longitude !== state.location.longitude;
      return { ...state, location, existingLocation: coordsChanged ? null : state.existingLocation };
    }
    case "SET_LOCATION":
      return { ...state, location: action.payload, existingLocation: null };
    case "SET_EXISTING_LOCATION":
      return { ...state, location: action.payload.location, existingLocation: { ...action.payload.location, id: action.payload.id } };
    case "ADD_DELETED_ID":
      return { ...state, deletedServerCellIds: [...state.deletedServerCellIds, action.payload] };
    case "CLEAR_DELETED":
      return { ...state, deletedServerCellIds: [] };
    case "RESET_CREATE":
      return getInitialFormState(undefined);
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
    case "SET_UPLINK_TYPE":
      return {
        ...state,
        uplinkType: action.payload,
        uplinkSpeed: action.payload ? state.uplinkSpeed : null,
        uplinkModel: action.payload === "microwave" ? state.uplinkModel : "",
      };
    case "SET_UPLINK_SPEED":
      return { ...state, uplinkSpeed: action.payload };
    case "SET_UPLINK_MODEL":
      return { ...state, uplinkModel: action.payload };
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

  const [originalStation, setOriginalStation] = useState(station);
  const [formState, dispatch] = useReducer(formReducer, station, getInitialFormState);
  const {
    stationId,
    operatorId,
    notes,
    extraAddress,
    isConfirmed,
    location,
    existingLocation,
    deletedServerCellIds,
    networksId,
    networksName,
    mnoName,
    stationStatus,
    uplinkType,
    uplinkSpeed,
    uplinkModel,
  } = formState;

  const { data: settings } = useSettings();
  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { data: allBands = [] } = useQuery(bandsQueryOptions());
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";
  const selectedOperator = useMemo(() => operators.find((operator) => operator.id === operatorId), [operators, operatorId]);

  const areCellActionsLocked = !isCreateMode && station?.status !== "published";

  const [photos, setPhotos] = useState<File[]>([]);
  const [photoNotes, setPhotoNotes] = useState<string[]>([]);
  const [photoTakenAts, setPhotoTakenAts] = useState<(Date | null)[]>([]);
  const [sectors, setSectors] = useState<SectorDraft[]>(() => toSectorDrafts(station?.sectors));

  const saveMutation = useSaveStationMutation();
  const handleServerCellDelete = useCallback((cell: LocalCell) => {
    if (cell._serverId) dispatch({ type: "ADD_DELETED_ID", payload: cell._serverId });
  }, []);

  const createNewStationCell = useCallback(
    (rat: string, defaultBand: Band): LocalCell => ({
      _localId: nanoid(),
      _sectorLocalId: null,
      rat: rat as (typeof RAT_ORDER)[number],
      band_id: defaultBand.id,
      type: DEFAULT_CELL_TYPE,
      is_confirmed: isAdmin,
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
    toggleRat,
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
    operatorMnc: selectedOperator?.mnc ?? null,
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

  const handleToggleRat = useCallback(
    (rat: string) => {
      if (isCreateMode && enabledRats.includes(rat)) setLocalCells((prev) => prev.filter((cell) => cell.rat !== rat));
      toggleRat(rat);
    },
    [enabledRats, isCreateMode, setLocalCells, toggleRat],
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

  const stationFieldHandlers = useMemo(
    () => ({
      onStationIdChange: (value: string) => dispatch({ type: "SET_STATION_ID", payload: value }),
      onOperatorIdChange: (value: number | null) => dispatch({ type: "SET_OPERATOR_ID", payload: value }),
      onNotesChange: (value: string) => dispatch({ type: "SET_NOTES", payload: value }),
      onExtraAddressChange: (value: string) => dispatch({ type: "SET_EXTRA_ADDRESS", payload: value }),
      onIsConfirmedChange: (value: boolean) => dispatch({ type: "SET_CONFIRMED", payload: value }),
      onStatusChange: (value: StationStatus) => dispatch({ type: "SET_STATUS", payload: value }),
      onNetworksIdChange: (value: number | null) => dispatch({ type: "SET_NETWORKS_ID", payload: value }),
      onNetworksNameChange: (value: string) => dispatch({ type: "SET_NETWORKS_NAME", payload: value }),
      onMnoNameChange: (value: string) => dispatch({ type: "SET_MNO_NAME", payload: value }),
      onUplinkTypeChange: (value: UplinkType | null) => dispatch({ type: "SET_UPLINK_TYPE", payload: value }),
      onUplinkSpeedChange: (value: number | null) => dispatch({ type: "SET_UPLINK_SPEED", payload: value }),
      onUplinkModelChange: (value: string) => dispatch({ type: "SET_UPLINK_MODEL", payload: value }),
    }),
    [],
  );

  const { derivedSectorCount, assignedSectorLocalIds } = useSectorPanelState(localCells);

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
        type: cell.type ?? DEFAULT_CELL_TYPE,
        is_confirmed: false,
        notes: "",
        details: { ...cell.details },
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
    const ukeStation = groupPermitsByStation(preloadUkePermits)[0];
    if (!ukeStation) return;
    hasAppliedUkePreload.current = true;
    handleUkeStationSelect(ukeStation);
  }, [preloadUkePermits, handleUkeStationSelect]);

  const loadStation = (nextStation: Station) => {
    setOriginalStation(nextStation);
    dispatch({ type: "LOAD_STATION", payload: nextStation });
    const loadedRats = new Set(nextStation.cells.map((cell) => cell.rat));
    setEnabledRats(RAT_ORDER.filter((rat) => loadedRats.has(rat)));
    setLocalCells(sortAndMapCells(nextStation.cells));
    setSectors(toSectorDrafts(nextStation.sectors));
  };

  const handleSaveStation = () => {
    if (isCreateMode) {
      if (!stationId.trim()) {
        toast.error(t("common:validation.stationIdRequired"));
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
      toast.error(t("common:validation.addressOwnWordForbidden"));
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
        existingLocation,
        localCells,
        sectors,
        deletedServerCellIds,
        originalStation,
        networksId: networksId ?? undefined,
        networksName: networksName || undefined,
        mnoName: mnoName || undefined,
        skipExtraIds: false,
        stationStatus,
        uplinkType,
        uplinkSpeed: uplinkSpeed ?? undefined,
        uplinkModel: uplinkModel || undefined,
      },
      {
        onSuccess: (result) => {
          if (result.mode === "create") {
            const resultLocationId = result.station.location?.id;
            const photoUpload =
              photos.length > 0 && resultLocationId
                ? trackPhotoUpload(
                    (onProgress) =>
                      uploadAndAssignStationPhotos({
                        locationId: resultLocationId,
                        stationId: result.station.id,
                        files: photos,
                        notes: photoNotes,
                        takenAts: photoTakenAts,
                        selected: [],
                        mainId: null,
                        useFirstUploadedAsMain: true,
                        onProgress,
                      }),
                    { error: () => t("toast.photoUploadFailed") },
                  ).catch(() => undefined)
                : Promise.resolve();
            void photoUpload.then(() => {
              toast.success(t("toast.created"));
              void navigate({ to: `/admin/stations/${result.station.id}`, replace: true });
            });
            return;
          }

          toast.success(t("toast.saved"));
          void queryClient
            .query(adminStationQueryOptions(result.stationId))
            .then(loadStation)
            .catch(() => toast.error(t("toast.refreshFailed")));
        },
        onError: (error) => {
          showApiError(error);
          if (originalStation)
            void queryClient
              .query(adminStationQueryOptions(originalStation.id))
              .then(setOriginalStation)
              .catch(() => undefined);
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
    if (station) loadStation(station);
  };

  const originalCells = useMemo(() => originalStation?.cells ?? [], [originalStation]);
  const originalCellsById = useMemo(() => new Map(originalCells.map((cell) => [cell.id, cell])), [originalCells]);
  const deletedServerCellIdSet = useMemo(() => new Set(deletedServerCellIds), [deletedServerCellIds]);
  const initial = useMemo(() => getInitialFormState(originalStation), [originalStation]);

  const hasChanges = useMemo(() => {
    if (isCreateMode) return true;
    if (!originalStation) return false;

    if (stationId !== initial.stationId) return true;
    if (operatorId !== initial.operatorId) return true;
    if (notes !== initial.notes) return true;
    if (extraAddress !== initial.extraAddress) return true;
    if (isConfirmed !== initial.isConfirmed) return true;
    if (!shallowEqual(location, initial.location)) return true;
    if (deletedServerCellIds.length > 0) return true;
    if (localCells.length !== originalCells.length) return true;
    if (networksId !== initial.networksId) return true;
    if (networksName !== initial.networksName) return true;
    if (mnoName !== initial.mnoName) return true;
    if (stationStatus !== initial.stationStatus) return true;
    if (uplinkType !== initial.uplinkType) return true;
    if (uplinkSpeed !== initial.uplinkSpeed) return true;
    if (uplinkModel !== initial.uplinkModel) return true;
    if (sectorsChanged(sectors, originalStation.sectors)) return true;
    return localCells.some((lc) => getLocalCellDiffStatus(lc, originalCells) !== "unchanged");
  }, [
    isCreateMode,
    originalStation,
    initial,
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
    uplinkType,
    uplinkSpeed,
    uplinkModel,
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
      const original = diffStatus === "unchanged" && cell._serverId ? originalCellsById.get(cell._serverId) : undefined;
      return {
        leftBorderClass: getDiffBorderClass(diffStatus),
        rowClassName: original ? getRecentCellRowClass(original) : undefined,
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
              {...stationFieldHandlers}
              stationDbId={station?.id}
              stationId={stationId}
              operatorId={operatorId}
              notes={notes}
              extraAddress={isCreateMode ? undefined : extraAddress}
              isConfirmed={isConfirmed}
              status={isCreateMode ? undefined : stationStatus}
              location={location}
              onLocationChange={handleLocationChange}
              onExistingLocationSelect={handleExistingLocationSelect}
              operators={operators}
              selectedOperator={selectedOperator}
              onUkeStationSelect={handleUkeStationSelect}
              networksId={networksId}
              networksName={networksName}
              mnoName={mnoName}
              currentLocation={station?.location ?? null}
              showEditLocationLink={!isCreateMode}
              sectors={sectors}
              onSectorsChange={handleSectorsChange}
              derivedSectorCount={derivedSectorCount}
              assignedSectorLocalIds={assignedSectorLocalIds}
              uplinkType={uplinkType}
              uplinkSpeed={uplinkSpeed}
              uplinkModel={uplinkModel}
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
      { titleKey: "sections.admin", path: "/admin/stations", i18nNamespace: "nav" },
      { titleKey: "items.stations", path: "/admin/stations", i18nNamespace: "nav" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
