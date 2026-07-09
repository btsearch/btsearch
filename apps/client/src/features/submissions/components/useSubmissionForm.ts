import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { SubmissionDetail } from "@/features/admin/submissions/types";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { groupPermitsByStation } from "@/features/map/utils";
import { bandsQueryOptions } from "@/features/shared/queries";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { showApiError } from "@/lib/api";
import type { SectorDraft, UkeStation } from "@/types/station";

import {
  type SearchStation,
  createSubmission,
  deleteSubmission,
  fetchStationForSubmission,
  fetchSubmissionForEdit,
  updateSubmission,
  uploadSubmissionPhotos,
} from "../api";
import type { ProposedCellForm, ProposedLocationForm, ProposedStationForm, RatType, StationAction, SubmissionMode } from "../types";
import { cellsToPayloads, computeCellPayloads, generateCellId, sectorsToPayloads, ukePermitsToCells } from "../utils/cells";
import { type OriginalState, hasFormChanges } from "../utils/equality";
import { type FormErrors, hasErrors, validateCells, validateForm } from "../utils/validation";

export type FormValues = {
  mode: SubmissionMode;
  action: StationAction;
  selectedStation: SearchStation | null;
  newStation: ProposedStationForm;
  location: ProposedLocationForm;
  selectedRats: RatType[];
  cells: ProposedCellForm[];
  originalCells: ProposedCellForm[];
  sectors: SectorDraft[];
  originalSectors: SectorDraft[];
  submitterNote: string;
  networksId: number | null;
  networksName: string;
  mnoName: string;
};

const INITIAL_VALUES: FormValues = {
  mode: "new",
  action: "update",
  selectedStation: null,
  newStation: { station_id: "", operator_id: null, notes: "" },
  location: { region_id: null, city: "", address: "", longitude: null, latitude: null },
  selectedRats: [],
  cells: [],
  originalCells: [],
  sectors: [],
  originalSectors: [],
  submitterNote: "",
  networksId: null,
  networksName: "",
  mnoName: "",
};

function buildOriginalState(values: FormValues): OriginalState {
  return {
    action: values.action,
    station: values.mode === "new" ? structuredClone(values.newStation) : undefined,
    location: structuredClone(values.location),
    sectors: structuredClone(values.sectors),
    cells: structuredClone(values.cells),
    networksId: values.mode === "existing" ? values.networksId : null,
    networksName: values.mode === "existing" && values.networksId !== null ? values.networksName : "",
    mnoName: values.mode === "existing" ? values.mnoName : "",
    submitterNote: values.submitterNote,
  };
}

function stationCellsToForm(station: SearchStation): ProposedCellForm[] {
  return station.cells.map((cell) => ({
    id: generateCellId(),
    existingCellId: cell.id,
    _sectorLocalId: cell.sector_id ? `sector-${cell.sector_id}` : null,
    rat: cell.rat as RatType,
    band_id: cell.band_id,
    notes: cell.notes ?? undefined,
    is_confirmed: cell.is_confirmed,
    details: cell.details ?? {},
  }));
}

function stationSectorsToDrafts(station: SearchStation): SectorDraft[] {
  return (station.sectors ?? []).map((sector) => ({ ...sector, _localId: `sector-${sector.id}` }));
}

function proposedCellSectorLocalId(cell: SubmissionDetail["cells"][number]): string | null | undefined {
  if (cell.sector_local_id) return cell.sector_local_id;
  if (cell.target_sector_id) return `sector-${cell.target_sector_id}`;
  if (cell.sector_unassigned) return null;
  return undefined;
}

type UseSubmissionFormProps = {
  preloadStationId?: number;
  editSubmissionId?: string;
  preloadUkeStationId?: string;
};

export function useSubmissionForm({ preloadStationId, editSubmissionId, preloadUkeStationId }: UseSubmissionFormProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const queryClient = useQueryClient();
  const { data: allBands = [] } = useQuery(bandsQueryOptions());
  const [showErrors, setShowErrors] = useState(false);
  const [originalState, setOriginalState] = useState<OriginalState>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoNotes, setPhotoNotes] = useState<string[]>([]);
  const [photoTakenAts, setPhotoTakenAts] = useState<(Date | null)[]>([]);
  const [locationPhotoIds, setLocationPhotoIds] = useState<number[]>([]);
  const [locationPhotoIdsToRemove, setLocationPhotoIdsToRemove] = useState<number[]>([]);
  const [mainLocationPhotoId, setMainLocationPhotoId] = useState<number | null>(null);
  const submittedValuesRef = useRef<FormValues | null>(null);

  const clearLocationPhotoDraft = useCallback(() => {
    setLocationPhotoIds([]);
    setLocationPhotoIdsToRemove([]);
    setMainLocationPhotoId(null);
  }, []);

  const isEditMode = !!editSubmissionId;

  const { data: preloadedStation } = useQuery({
    queryKey: ["station-for-submission", preloadStationId],
    queryFn: () => fetchStationForSubmission(preloadStationId ?? 0),
    enabled: !!preloadStationId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: editSubmission } = useQuery({
    queryKey: ["submission-edit", editSubmissionId],
    queryFn: () => {
      if (!editSubmissionId) throw new Error("editSubmissionId is required");
      return fetchSubmissionForEdit(editSubmissionId);
    },
    enabled: isEditMode,
    staleTime: 1000 * 60 * 5,
  });

  const { data: preloadUkePermits } = useQuery({
    queryKey: ["uke-permits-preload", preloadUkeStationId],
    queryFn: () => fetchUkePermitsByStationId(preloadUkeStationId!),
    enabled: !!preloadUkeStationId && !isEditMode,
    staleTime: 1000 * 60 * 5,
  });

  const computeHasChanges = useCallback(
    (
      mode: SubmissionMode,
      action: StationAction,
      newStation: ProposedStationForm,
      location: ProposedLocationForm,
      cells: ProposedCellForm[],
      sectors: SectorDraft[],
      submitterNote: string,
      networksId: number | null,
      networksName: string | null,
      mnoName: string | null,
    ): boolean => {
      if (photos.length > 0) return true;
      if (locationPhotoIds.length > 0) return true;
      if (locationPhotoIdsToRemove.length > 0) return true;
      if (hasFormChanges({ mode, action, newStation, location, sectors, cells, submitterNote }, originalState)) return true;
      if (mode === "existing") {
        if (networksId !== (originalState.networksId ?? null)) return true;
        if (networksId !== null && networksName !== (originalState.networksName ?? "")) return true;
        if (mnoName !== (originalState.mnoName ?? "")) return true;
      }
      return false;
    },
    [originalState, photos.length, locationPhotoIds.length, locationPhotoIdsToRemove.length],
  );

  const form = useForm({
    defaultValues: INITIAL_VALUES,
    onSubmit: async ({ value }) => {
      submittedValuesRef.current = structuredClone(value);
      const activeCells = value.cells.filter((c) => value.selectedRats.includes(c.rat));

      if (!isEditMode && value.mode === "new" && activeCells.length === 0 && photos.length === 0) {
        toast.error(t("validation.pendingStationPhotoRequired"));
        return;
      }

      const errors = validateForm({
        mode: value.mode,
        selectedStation: value.selectedStation,
        newStation: value.newStation,
        location: value.location,
        cells: activeCells,
        bands: allBands,
        originalCells: value.originalCells,
      });

      if (hasErrors(errors)) {
        setShowErrors(true);
        const messages = collectErrorMessages(errors);
        for (const msg of messages) toast.error(t(msg));
        return;
      }

      const isNewStation = value.mode === "new";
      const isDeleteMode = value.action === "delete";
      const cells = isNewStation ? cellsToPayloads(activeCells) : computeCellPayloads(value.originalCells, activeCells);
      const sectors = sectorsToPayloads(value.sectors);

      const hasLocation = value.location.latitude !== null && value.location.longitude !== null;

      const submissionType = isDeleteMode ? "delete" : isNewStation ? "new" : "update";

      const hadExtraIds = (originalState.networksId !== null && originalState.networksId !== undefined) || !!originalState.mnoName;
      const existingStation =
        !isNewStation && !isDeleteMode && (value.networksId !== null || value.networksName || value.mnoName || hadExtraIds)
          ? {
              station_id: value.selectedStation!.station_id,
              operator_id: value.selectedStation!.operator?.id ?? value.selectedStation!.operator_id,
              networks_id: value.networksId,
              networks_name: value.networksName || null,
              mno_name: value.mnoName || null,
            }
          : undefined;

      await mutation.mutateAsync({
        station_id: isNewStation ? null : (value.selectedStation?.id ?? null),
        type: submissionType,
        submitter_note: value.submitterNote || undefined,
        station: isNewStation ? value.newStation : existingStation,
        location: hasLocation && !isDeleteMode ? value.location : undefined,
        sectors: !isDeleteMode ? sectors : undefined,
        cells: isDeleteMode ? [] : cells,
        pending_photos: photos.length > 0 ? photos.length : undefined,
        location_photo_ids: !isNewStation && !isDeleteMode && locationPhotoIds.length > 0 ? locationPhotoIds : undefined,
        location_photo_ids_to_remove: !isNewStation && !isDeleteMode && locationPhotoIdsToRemove.length > 0 ? locationPhotoIdsToRemove : undefined,
        main_location_photo_id:
          !isNewStation && !isDeleteMode && mainLocationPhotoId !== null && locationPhotoIds.includes(mainLocationPhotoId)
            ? mainLocationPhotoId
            : undefined,
      });
    },
  });

  const mutation = useMutation({
    mutationFn: isEditMode
      ? (data: Parameters<typeof updateSubmission>[1]) => {
          if (!editSubmissionId) throw new Error("editSubmissionId is required for updateSubmission");
          return updateSubmission(editSubmissionId, data);
        }
      : createSubmission,
    onSuccess: (data) => {
      const submittedValues = submittedValuesRef.current;
      if (photos.length > 0) {
        const submissionId = isEditMode && editSubmissionId ? editSubmissionId : data.id;
        const isPhotosOnly = !!data.pending_photos;
        void uploadSubmissionPhotos(
          submissionId,
          photos,
          photoNotes,
          photoTakenAts.map((d) => d?.toISOString() ?? null),
        ).catch(() => {
          toast.error(t("toast.photoUploadFailed"));
          if (isPhotosOnly) void deleteSubmission(submissionId).catch(() => undefined);
        });
        setPhotos([]);
        setPhotoNotes([]);
        setPhotoTakenAts([]);
      }
      toast.success(t(isEditMode ? "toast.updated" : "toast.submitted"));
      clearLocationPhotoDraft();
      if (isEditMode && submittedValues) {
        setOriginalState(buildOriginalState(submittedValues));
        void queryClient.invalidateQueries({ queryKey: ["submission-edit", editSubmissionId] });
      } else {
        form.reset();
        setOriginalState({});
      }
      setShowErrors(false);
      submittedValuesRef.current = null;
    },
    onError: (error) => {
      submittedValuesRef.current = null;
      showApiError(error);
    },
  });

  const handleModeChange = useCallback(
    (newMode: SubmissionMode) => {
      form.setFieldValue("mode", newMode);
      form.setFieldValue("action", "update");
      form.setFieldValue("location", INITIAL_VALUES.location);
      form.setFieldValue("submitterNote", "");
      form.setFieldValue("networksId", null);
      form.setFieldValue("networksName", "");
      form.setFieldValue("mnoName", "");
      if (newMode === "existing") form.setFieldValue("newStation", INITIAL_VALUES.newStation);
      form.setFieldValue("selectedStation", null);
      form.setFieldValue("cells", []);
      form.setFieldValue("originalCells", []);
      form.setFieldValue("sectors", []);
      form.setFieldValue("originalSectors", []);
      form.setFieldValue("selectedRats", []);
      clearLocationPhotoDraft();
    },
    [clearLocationPhotoDraft, form],
  );

  const handleActionChange = useCallback(
    (action: StationAction) => {
      form.setFieldValue("action", action);
      if (action === "delete") {
        form.setFieldValue("submitterNote", "");
        clearLocationPhotoDraft();
      }
    },
    [clearLocationPhotoDraft, form],
  );

  const loadStation = useCallback(
    (station: SearchStation | null) => {
      form.setFieldValue("selectedStation", station);
      form.setFieldValue("action", "update");
      clearLocationPhotoDraft();

      if (station) {
        const cells = stationCellsToForm(station);
        const sectors = stationSectorsToDrafts(station);
        form.setFieldValue("cells", cells);
        form.setFieldValue("originalCells", structuredClone(cells));
        form.setFieldValue("sectors", sectors);
        form.setFieldValue("originalSectors", structuredClone(sectors));
        form.setFieldValue("selectedRats", [...new Set(cells.map((c) => c.rat))]);

        const networksId = station.extra_identificators?.networks_id ?? null;
        const networksName = station.extra_identificators?.networks_name ?? "";
        const mnoName = station.extra_identificators?.mno_name ?? "";
        form.setFieldValue("networksId", networksId);
        form.setFieldValue("networksName", networksName);
        form.setFieldValue("mnoName", mnoName);

        if (station.location) {
          const location = {
            latitude: station.location.latitude,
            longitude: station.location.longitude,
            city: station.location.city ?? "",
            address: station.location.address ?? "",
            region_id: station.location.region?.id ?? null,
          };
          form.setFieldValue("location", location);
          setOriginalState({
            action: "update",
            location,
            sectors: structuredClone(sectors),
            cells: structuredClone(cells),
            networksId,
            networksName,
            mnoName,
          });
        } else {
          setOriginalState({ action: "update", sectors: structuredClone(sectors), cells: structuredClone(cells), networksId, networksName, mnoName });
        }
      } else {
        form.setFieldValue("cells", []);
        form.setFieldValue("originalCells", []);
        form.setFieldValue("sectors", []);
        form.setFieldValue("originalSectors", []);
        form.setFieldValue("selectedRats", []);
        form.setFieldValue("location", INITIAL_VALUES.location);
        form.setFieldValue("networksId", null);
        form.setFieldValue("networksName", "");
        form.setFieldValue("mnoName", "");
        setOriginalState({});
      }
    },
    [clearLocationPhotoDraft, form],
  );

  const handleUkeStationSelect = useCallback(
    (station: UkeStation) => {
      form.setFieldValue("mode", "new");
      form.setFieldValue("selectedStation", null);
      form.setFieldValue("newStation", {
        station_id: station.station_id,
        operator_id: station.operator?.id ?? null,
        notes: "",
      });

      if (station.location) {
        form.setFieldValue("location", {
          latitude: station.location.latitude,
          longitude: station.location.longitude,
          city: station.location.city ?? "",
          address: station.location.address ?? "",
          region_id: station.location.region?.id ?? null,
        });
      }

      const cells = ukePermitsToCells(station.permits);
      form.setFieldValue("cells", cells);
      form.setFieldValue("originalCells", []);
      form.setFieldValue("sectors", []);
      form.setFieldValue("originalSectors", []);
      form.setFieldValue("selectedRats", [...new Set(cells.map((c) => c.rat))]);
    },
    [form],
  );

  const handleRatsChange = useCallback(
    (rats: RatType[]) => {
      form.setFieldValue("selectedRats", rats);
    },
    [form],
  );

  const handleCellsChange = useCallback(
    (rat: RatType, updatedCells: ProposedCellForm[]) => {
      const otherCells = form.getFieldValue("cells").filter((c) => c.rat !== rat);
      form.setFieldValue("cells", [...otherCells, ...updatedCells]);
    },
    [form],
  );

  const handleSectorsChange = useCallback(
    (sectors: SectorDraft[]) => {
      form.setFieldValue("sectors", sectors);
    },
    [form],
  );

  const handleLocationChange = useCallback(
    (patch: Partial<ProposedLocationForm>) => {
      const current = form.getFieldValue("location");
      form.setFieldValue("location", { ...current, ...patch });
    },
    [form],
  );

  const handleNewStationChange = useCallback(
    (station: ProposedStationForm) => {
      form.setFieldValue("newStation", station);
    },
    [form],
  );

  const handleSubmitterNoteChange = useCallback(
    (note: string) => {
      form.setFieldValue("submitterNote", note);
    },
    [form],
  );

  const handleNetworksIdChange = useCallback(
    (value: number | null) => {
      form.setFieldValue("networksId", value);
    },
    [form],
  );

  const handleNetworksNameChange = useCallback(
    (value: string) => {
      form.setFieldValue("networksName", value);
    },
    [form],
  );

  const handleMnoNameChange = useCallback(
    (value: string) => {
      form.setFieldValue("mnoName", value);
    },
    [form],
  );

  const hasAppliedUkePreload = useRef(false);

  useEffect(() => {
    if (!preloadUkePermits?.length || hasAppliedUkePreload.current) return;
    const station = groupPermitsByStation(preloadUkePermits)[0];
    if (station) {
      hasAppliedUkePreload.current = true;
      handleUkeStationSelect(station);
    }
  }, [preloadUkePermits, preloadUkeStationId, handleUkeStationSelect]);

  const lastAppliedStationId = useRef<number | null>(null);

  useEffect(() => {
    if (preloadedStation) {
      if (preloadedStation.id !== lastAppliedStationId.current) {
        lastAppliedStationId.current = preloadedStation.id;
        const station = preloadedStation;
        queueMicrotask(() => {
          form.setFieldValue("mode", "existing");
          form.setFieldValue("newStation", INITIAL_VALUES.newStation);
          loadStation(station);
        });
      }
    } else if (!preloadStationId) {
      lastAppliedStationId.current = null;
    }
  }, [preloadedStation, preloadStationId, form, loadStation]);

  const lastAppliedEditKey = useRef<string | null>(null);

  useEffect(() => {
    if (!editSubmission) return;
    const editKey = `${editSubmission.id}:${editSubmission.updatedAt}`;
    if (editKey === lastAppliedEditKey.current) return;
    lastAppliedEditKey.current = editKey;

    let ignore = false;
    const submission = editSubmission;
    setLocationPhotoIds(submission.locationPhotoSelections.map((photo) => photo.id));
    setLocationPhotoIdsToRemove(submission.locationPhotoRemovalSelections.map((photo) => photo.id));
    setMainLocationPhotoId(submission.locationPhotoSelections.find((photo) => photo.is_main)?.id ?? null);

    const isNew = submission.type === "new";
    const proposedCells: ProposedCellForm[] = submission.cells.map((cell) => ({
      id: generateCellId(),
      existingCellId: cell.target_cell_id ?? undefined,
      rat: cell.rat as RatType,
      _sectorLocalId: proposedCellSectorLocalId(cell),
      band_id: cell.band_id,
      notes: cell.notes ?? undefined,
      is_confirmed: cell.is_confirmed,
      details: cell.details ?? {},
    }));

    const deletedTargetIds = new Set<number>();
    const updatedTargetIds = new Set<number>();
    for (const cell of submission.cells) {
      if (cell.target_cell_id === null) continue;
      if (cell.operation === "delete") deletedTargetIds.add(cell.target_cell_id);
      else if (cell.operation === "update") updatedTargetIds.add(cell.target_cell_id);
    }

    queueMicrotask(() => {
      form.setFieldValue("mode", isNew ? "new" : "existing");
      form.setFieldValue("action", submission.type === "delete" ? "delete" : "update");
      form.setFieldValue("submitterNote", submission.submitter_note ?? "");
      const proposedSectors = (submission.sectors ?? []).map((sector) => ({
        _localId: sector.local_id,
        id: sector.target_sector_id ?? undefined,
        azimuth: sector.azimuth,
      }));
      form.setFieldValue("sectors", proposedSectors);
      form.setFieldValue("originalSectors", structuredClone(proposedSectors));

      if (isNew && submission.proposedStation) {
        form.setFieldValue("newStation", {
          station_id: submission.proposedStation.station_id ?? "",
          operator_id: submission.proposedStation.operator_id,
          notes: submission.proposedStation.notes ?? "",
          networks_id: submission.proposedStation.networks_id ?? undefined,
          networks_name: submission.proposedStation.networks_name ?? undefined,
          mno_name: submission.proposedStation.mno_name ?? undefined,
        });
      }

      if (!isNew && submission.proposedStation) {
        if (submission.proposedStation.networks_id) {
          form.setFieldValue("networksId", submission.proposedStation.networks_id);
          form.setFieldValue("networksName", submission.proposedStation.networks_name ?? "");
        }

        if (submission.proposedStation.mno_name) form.setFieldValue("mnoName", submission.proposedStation.mno_name);
      }

      if (submission.proposedLocation) {
        form.setFieldValue("location", {
          region_id: submission.proposedLocation.region_id,
          city: submission.proposedLocation.city ?? "",
          address: submission.proposedLocation.address ?? "",
          longitude: submission.proposedLocation.longitude,
          latitude: submission.proposedLocation.latitude,
        });
      }

      if (!isNew && submission.station) {
        void fetchStationForSubmission(submission.station.id).then((station) => {
          if (ignore) return;
          form.setFieldValue("selectedStation", station);
          const originals = stationCellsToForm(station);
          const originalSectors = stationSectorsToDrafts(station);
          form.setFieldValue("originalCells", originals);
          form.setFieldValue("originalSectors", originalSectors);

          const unchangedCells = originals.filter(
            (c) => c.existingCellId !== undefined && !updatedTargetIds.has(c.existingCellId) && !deletedTargetIds.has(c.existingCellId),
          );
          const changedCells = proposedCells.filter((c) => c.existingCellId === undefined || updatedTargetIds.has(c.existingCellId));
          const mergedCells = [...unchangedCells, ...changedCells];

          form.setFieldValue("cells", mergedCells);
          form.setFieldValue("selectedRats", [...new Set(mergedCells.map((c) => c.rat))]);

          const effectiveLocation = submission.proposedLocation
            ? {
                region_id: submission.proposedLocation.region_id,
                city: submission.proposedLocation.city ?? "",
                address: submission.proposedLocation.address ?? "",
                longitude: submission.proposedLocation.longitude,
                latitude: submission.proposedLocation.latitude,
              }
            : station.location
              ? {
                  latitude: station.location.latitude,
                  longitude: station.location.longitude,
                  city: station.location.city ?? "",
                  address: station.location.address ?? "",
                  region_id: station.location.region?.id ?? null,
                }
              : INITIAL_VALUES.location;

          if (!submission.proposedLocation && station.location) {
            form.setFieldValue("location", effectiveLocation);
          }

          setOriginalState({
            action: submission.type === "delete" ? "delete" : "update",
            location: effectiveLocation,
            sectors: structuredClone(proposedSectors.length > 0 ? proposedSectors : originalSectors),
            cells: structuredClone(mergedCells),
            networksId: submission.proposedStation?.networks_id ?? null,
            networksName: submission.proposedStation?.networks_name ?? "",
            mnoName: submission.proposedStation?.mno_name ?? "",
            submitterNote: submission.submitter_note ?? "",
          });
        });
      } else {
        form.setFieldValue("cells", proposedCells);
        if (isNew) form.setFieldValue("originalCells", []);
        form.setFieldValue("selectedRats", [...new Set(proposedCells.map((c) => c.rat))]);

        const newLocation = submission.proposedLocation
          ? {
              region_id: submission.proposedLocation.region_id,
              city: submission.proposedLocation.city ?? "",
              address: submission.proposedLocation.address ?? "",
              longitude: submission.proposedLocation.longitude,
              latitude: submission.proposedLocation.latitude,
            }
          : INITIAL_VALUES.location;

        setOriginalState({
          action: submission.type === "delete" ? "delete" : "update",
          station: submission.proposedStation
            ? {
                station_id: submission.proposedStation.station_id ?? "",
                operator_id: submission.proposedStation.operator_id,
                notes: submission.proposedStation.notes ?? "",
              }
            : null,
          location: newLocation,
          sectors: structuredClone(proposedSectors),
          cells: structuredClone(proposedCells),
          submitterNote: submission.submitter_note ?? "",
        });
      }
    });

    return () => {
      ignore = true;
    };
  }, [editSubmission, form]);

  const cellErrors = useMemo(() => {
    if (!showErrors) return undefined;
    const currentCells = form.state.values.cells;
    const errors = validateCells(currentCells, allBands, form.state.values.originalCells);
    return Object.keys(errors).length > 0 ? errors : undefined;
  }, [showErrors, form.state.values.cells, form.state.values.originalCells, allBands]);

  const formErrors = useMemo((): FormErrors => {
    if (!showErrors) return {};
    const values = form.state.values;
    return validateForm({
      mode: values.mode,
      selectedStation: values.selectedStation,
      newStation: values.newStation,
      location: values.location,
      cells: [],
    });
  }, [showErrors, form.state.values]);

  const formValues = useStore(form.store, (s) => s.values);
  const isDirty = computeHasChanges(
    formValues.mode,
    formValues.action,
    formValues.newStation,
    formValues.location,
    formValues.cells,
    formValues.sectors,
    formValues.submitterNote,
    formValues.networksId,
    formValues.networksName,
    formValues.mnoName,
  );
  useBeforeUnloadGuard(isDirty);

  return {
    form,
    mutation,
    showErrors,
    isEditMode,
    editSubmissionId,
    cellErrors,
    formErrors,
    computeHasChanges,
    photos,
    setPhotos,
    photoNotes,
    setPhotoNotes,
    photoTakenAts,
    setPhotoTakenAts,
    locationPhotoIds,
    setLocationPhotoIds,
    locationPhotoIdsToRemove,
    setLocationPhotoIdsToRemove,
    mainLocationPhotoId,
    setMainLocationPhotoId,
    handlers: {
      handleModeChange,
      handleActionChange,
      loadStation,
      handleUkeStationSelect,
      handleRatsChange,
      handleCellsChange,
      handleSectorsChange,
      handleLocationChange,
      handleNewStationChange,
      handleSubmitterNoteChange,
      handleNetworksIdChange,
      handleNetworksNameChange,
      handleMnoNameChange,
    },
  };
}

function collectErrorMessages(errors: FormErrors): string[] {
  const messages: string[] = [];

  if (errors.general) messages.push(errors.general);
  if (errors.station) for (const msg of Object.values(errors.station)) if (msg) messages.push(msg);
  if (errors.location) for (const msg of Object.values(errors.location)) if (msg) messages.push(msg);

  if (errors.cells) {
    const seen = new Set<string>();
    for (const cellError of Object.values(errors.cells)) {
      if (cellError.band_id && !seen.has(cellError.band_id)) {
        seen.add(cellError.band_id);
        messages.push(cellError.band_id);
      }
      if (cellError.details) {
        for (const msg of Object.values(cellError.details)) {
          if (msg && !seen.has(msg)) {
            seen.add(msg);
            messages.push(msg);
          }
        }
      }
    }
  }

  return messages;
}
