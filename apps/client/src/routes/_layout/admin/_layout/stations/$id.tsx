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
import { RAT_ORDER } from "@/features/admin/cells/rat";
import { bandsQueryOptions, operatorsQueryOptions } from "@/features/admin/queries";
import { StationCommentsSection } from "@/features/admin/stations/components/stationCommentsSection";
import { StationDetailHeader } from "@/features/admin/stations/components/stationDetailHeader";
import { StationInfoForm } from "@/features/admin/stations/components/stationInfoForm";
import { StationPhotoSelector } from "@/features/admin/stations/components/StationPhotoSelector";
import { type LocalCell, isCellModified, useSaveStationMutation } from "@/features/admin/stations/mutations";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { setStationPhotoSelection, uploadLocationPhotos } from "@/features/station-details/api";
import { PhotoUploadSection } from "@/features/submissions/components/photoUploadSection";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { findDuplicateCids, findDuplicateEnbidClids } from "@/features/submissions/utils/cellDuplicates";
import { useSettings } from "@/hooks/useSettings";
import { fetchApiData, showApiError } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { shallowEqual } from "@/lib/shallowEqual";
import type { Band, Cell, Station, UkeStation } from "@/types/station";

function cellToLocal(cell: Cell): LocalCell {
  return {
    _localId: crypto.randomUUID(),
    _serverId: cell.id,
    rat: cell.rat as (typeof RAT_ORDER)[number],
    band_id: cell.band.id,
    is_confirmed: cell.is_confirmed,
    notes: cell.notes ?? "",
    details: { ...cell.details },
  };
}

function sortAndMapCells(cells: Cell[]): LocalCell[] {
  return [...cells]
    .sort((a, b) => {
      if (a.band.value !== b.band.value) return a.band.value - b.band.value;
      switch (a.rat) {
        case "GSM":
          return ((a.details?.cid as number) ?? 0) - ((b.details?.cid as number) ?? 0);
        case "UMTS":
          return ((a.details?.cid_long as number) ?? 0) - ((b.details?.cid_long as number) ?? 0);
        case "LTE":
          return ((a.details?.ecid as number) ?? 0) - ((b.details?.ecid as number) ?? 0);
        case "NR":
          return ((a.details?.nci as number) ?? 0) - ((b.details?.nci as number) ?? 0);
        default:
          return 0;
      }
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
  | { type: "SET_MNO_NAME"; payload: string };

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
  } = formState;

  const { data: settings } = useSettings();
  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { data: allBands = [] } = useQuery(bandsQueryOptions());
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const [photos, setPhotos] = useState<File[]>([]);
  const [photoNotes, setPhotoNotes] = useState<string[]>([]);
  const [photoTakenAts, setPhotoTakenAts] = useState<(Date | null)[]>([]);

  const saveMutation = useSaveStationMutation();
  const handleServerCellDelete = useCallback((cell: LocalCell) => {
    if (cell._serverId) dispatch({ type: "ADD_DELETED_ID", payload: cell._serverId });
  }, []);

  const createNewStationCell = useCallback(
    (rat: string, defaultBand: Band): LocalCell => ({
      _localId: crypto.randomUUID(),
      rat: rat as (typeof RAT_ORDER)[number],
      band_id: defaultBand.id,
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
    addCell: handleAddCell,
    cloneCell: handleCloneCell,
    clonedIds,
    deleteCell: handleDeleteCell,
  } = useCellDrafts<LocalCell>({
    initialCells: sortAndMapCells(station?.cells ?? []),
    allBands,
    createNewCell: createNewStationCell,
    onDelete: handleServerCellDelete,
    sortCellsByRat: false,
  });

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

      const seen = new Set<string>();
      const newCells: LocalCell[] = [];
      for (const permit of ukeStation.permits) {
        if (!permit.band || permit.band.rat === "IOT") continue;
        const key = `${permit.band.rat}-${permit.band.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        newCells.push({
          _localId: crypto.randomUUID(),
          rat: permit.band.rat as (typeof RAT_ORDER)[number],
          band_id: permit.band.id,
          is_confirmed: false,
          notes: "",
          details: {},
        });
      }
      newCells.sort((a, b) => RAT_ORDER.indexOf(a.rat) - RAT_ORDER.indexOf(b.rat));
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
    hasAppliedUkePreload.current = true;
    const first = preloadUkePermits[0];
    handleUkeStationSelect({
      station_id: preloadUkeStationId!,
      operator: first.operator ?? null,
      location: first.location ?? null,
      permits: preloadUkePermits,
    });
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
        deletedServerCellIds,
        originalStation: station,
        networksId: networksId ?? undefined,
        networksName: networksName || undefined,
        mnoName: mnoName || undefined,
        skipExtraIds: false,
      },
      {
        onSuccess: async (result) => {
          if (result.mode === "create") {
            const resultLocationId = result.station.location?.id;
            if (photos.length > 0 && resultLocationId) {
              await uploadLocationPhotos(resultLocationId, photos)
                .then((uploaded) =>
                  setStationPhotoSelection(
                    result.station.id,
                    uploaded.map((p) => p.id),
                    uploaded[0]?.id ?? null,
                  ),
                )
                .catch(() => {
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
      return;
    }
    if (!station) return;
    dispatch({ type: "LOAD_STATION", payload: station });
    const existingRats = new Set(station.cells.map((c) => c.rat));
    setEnabledRats(RAT_ORDER.filter((r) => existingRats.has(r)));
    setLocalCells(sortAndMapCells(station.cells));
  };

  const selectedOperator = useMemo(() => operators.find((o) => o.id === operatorId), [operators, operatorId]);

  const originalCells = useMemo(() => station?.cells ?? [], [station]);

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
  ]);

  const getStationDiffBadges = useCallback(
    (rat: string, cellsForRat: LocalCell[]): DiffBadges => {
      let added = 0;
      let modified = 0;
      for (const lc of cellsForRat) {
        const status = getLocalCellDiffStatus(lc, originalCells);
        if (status === "added") added++;
        else if (status === "modified") modified++;
      }
      const deleted = originalCells.filter((c) => c.rat === rat && deletedServerCellIds.includes(c.id)).length;
      return { added, modified, deleted };
    },
    [originalCells, deletedServerCellIds],
  );

  const getStationCellProps = useCallback(
    (cell: LocalCell) => {
      const diffStatus = getLocalCellDiffStatus(cell, originalCells);
      return {
        leftBorderClass: getDiffBorderClass(diffStatus),
      };
    },
    [originalCells],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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

      <div className="flex-1 overflow-y-auto">
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
              extraAddress={extraAddress}
              onExtraAddressChange={(v) => dispatch({ type: "SET_EXTRA_ADDRESS", payload: v })}
              isConfirmed={isConfirmed}
              onIsConfirmedChange={(v) => dispatch({ type: "SET_CONFIRMED", payload: v })}
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
              onToggleRat={handleToggleRat}
              onCellChange={handleCellChange}
              onAddCell={handleAddCell}
              onCloneCell={handleCloneCell}
              clonedIds={clonedIds}
              onDeleteCell={handleDeleteCell}
              getDiffBadges={getStationDiffBadges}
              getCellProps={getStationCellProps}
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
    titleKey: "breadcrumbs.editStation",
    i18nNamespace: "admin",
    breadcrumbs: [
      { titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" },
      { titleKey: "breadcrumbs.stations", path: "/admin/stations", i18nNamespace: "admin" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
