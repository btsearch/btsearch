import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  type SearchStation,
  createSubmission,
  deleteSubmission,
  fetchStationForSubmission,
  fetchSubmissionForEdit,
  updateSubmission,
  uploadSubmissionPhotos,
} from "../api";
import { submissionDetailQueryOptions } from "../queries";
import type {
  ProposedCellForm,
  ProposedLocationForm,
  ProposedStationForm,
  RatType,
  StationAction,
  SubmissionFormData,
  SubmissionMode,
} from "../types";
import { cellsToPayloads, computeCellPayloads, generateCellId, sectorsToPayloads, ukePermitsToCells } from "../utils/cells";
import { type OriginalState, hasFormChanges, isEqualStation } from "../utils/equality";
import {
  type StationValues,
  applyProposedLocation,
  applyProposedStation,
  diffLocationValues,
  diffStationValues,
  hasPayloadChanges,
  toLocationValues,
  toStationValues,
} from "../utils/proposalChanges";
import { type FormErrors, hasErrors, validateCells, validateForm } from "../utils/validation";
import { type PhotoDraft, usePhotoDraft } from "./hooks/usePhotoDraft";
import { trackPhotoUpload } from "@/components/photos/photoUploadToast";
import type { SubmissionDetail } from "@/features/admin/submissions/types";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { groupPermitsByStation } from "@/features/map/utils";
import { bandsQueryOptions } from "@/features/shared/queries";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { showApiError } from "@/lib/api";
import { photoQualityErrorKey } from "@/lib/photoUploadError";
import { shallowEqual } from "@/lib/shallowEqual";
import type { SectorDraft, UkeStation, UplinkType } from "@/types/station";

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
  uplinkType: UplinkType | null;
  uplinkSpeed: number | null;
  uplinkModel: string;
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
  uplinkType: null,
  uplinkSpeed: null,
  uplinkModel: "",
};

type UplinkValues = Pick<FormValues, "uplinkType" | "uplinkSpeed" | "uplinkModel">;
type StationFields = Pick<FormValues, "newStation" | "networksId" | "networksName" | "mnoName" | "uplinkType" | "uplinkSpeed" | "uplinkModel">;
type ValidationValues = Pick<FormValues, "mode" | "selectedStation" | "newStation" | "location" | "cells" | "originalCells">;

function buildOriginalState(values: FormValues): OriginalState {
  const isExisting = values.mode === "existing";
  return {
    action: values.action,
    station: structuredClone(values.newStation),
    location: structuredClone(values.location),
    sectors: structuredClone(values.sectors),
    cells: structuredClone(values.cells),
    networksId: isExisting ? values.networksId : null,
    networksName: isExisting ? values.networksName : "",
    mnoName: isExisting ? values.mnoName : "",
    uplinkType: values.uplinkType,
    uplinkSpeed: values.uplinkSpeed,
    uplinkModel: values.uplinkModel,
    submitterNote: values.submitterNote,
  };
}

function formStationValues(values: FormValues): StationValues {
  return {
    station_id: values.newStation.station_id ?? "",
    operator_id: values.newStation.operator_id,
    notes: values.newStation.notes ?? "",
    networks_id: values.networksId,
    networks_name: values.networksName,
    mno_name: values.mnoName,
    uplink_type: values.uplinkType,
    uplink_speed: values.uplinkSpeed,
    uplink_model: values.uplinkModel,
  };
}

function stationFields(values: StationValues): StationFields {
  return {
    newStation: { station_id: values.station_id, operator_id: values.operator_id, notes: values.notes },
    networksId: values.networks_id,
    networksName: values.networks_name,
    mnoName: values.mno_name,
    uplinkType: values.uplink_type,
    uplinkSpeed: values.uplink_speed,
    uplinkModel: values.uplink_model,
  };
}

function uplinkDiffers(values: UplinkValues, originalState: OriginalState): boolean {
  return (
    values.uplinkType !== (originalState.uplinkType ?? null) ||
    values.uplinkSpeed !== (originalState.uplinkSpeed ?? null) ||
    values.uplinkModel !== (originalState.uplinkModel ?? "")
  );
}

function pickValidationValues(values: FormValues): ValidationValues {
  return {
    mode: values.mode,
    selectedStation: values.selectedStation,
    newStation: values.newStation,
    location: values.location,
    cells: values.cells,
    originalCells: values.originalCells,
  };
}

function isSameValidationValues(a: ValidationValues | null, b: ValidationValues | null): boolean {
  return a === b || (a !== null && b !== null && shallowEqual(a, b));
}

function selectedRatsOf(cells: ProposedCellForm[]): RatType[] {
  return [...new Set(cells.map((cell) => cell.rat))];
}

function requiresUploadedPhoto(data: SubmissionFormData): boolean {
  if (data.type === "new") return data.cells.length === 0;
  if (data.type === "delete") return false;
  return (
    !data.station &&
    !data.location &&
    !data.sectors?.length &&
    data.cells.length === 0 &&
    !data.location_photo_ids?.length &&
    !data.location_photo_ids_to_remove?.length
  );
}

function stationCellsToForm(station: SearchStation): ProposedCellForm[] {
  return station.cells.map((cell) => ({
    id: generateCellId(),
    existingCellId: cell.id,
    _sectorLocalId: cell.sector_id ? `sector-${cell.sector_id}` : null,
    rat: cell.rat as RatType,
    band_id: cell.band_id,
    type: cell.type ?? null,
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

function proposedCellsToForm(submission: SubmissionDetail): ProposedCellForm[] {
  return submission.cells.map((cell) => ({
    id: generateCellId(),
    existingCellId: cell.target_cell_id ?? undefined,
    rat: cell.rat as RatType,
    _sectorLocalId: proposedCellSectorLocalId(cell),
    band_id: cell.band_id,
    type: cell.type ?? null,
    notes: cell.notes ?? undefined,
    is_confirmed: cell.is_confirmed,
    details: cell.details ?? {},
  }));
}

function proposedSectorsToDrafts(submission: SubmissionDetail): SectorDraft[] {
  return submission.sectors.map((sector) => ({ _localId: sector.local_id, id: sector.target_sector_id ?? undefined, azimuth: sector.azimuth }));
}

function existingStationValues(station: SearchStation): Omit<FormValues, "mode" | "submitterNote"> {
  const cells = stationCellsToForm(station);
  const sectors = stationSectorsToDrafts(station);
  return {
    action: "update",
    selectedStation: station,
    location: toLocationValues(station.location),
    selectedRats: selectedRatsOf(cells),
    cells,
    originalCells: structuredClone(cells),
    sectors,
    originalSectors: structuredClone(sectors),
    ...stationFields(toStationValues(station)),
  };
}

function editValuesForStation(submission: SubmissionDetail, station: SearchStation): FormValues {
  const originalCells = stationCellsToForm(station);
  const originalSectors = stationSectorsToDrafts(station);
  const proposedSectors = proposedSectorsToDrafts(submission);
  const updatedIds = new Set<number>();
  const deletedIds = new Set<number>();
  for (const cell of submission.cells) {
    if (cell.target_cell_id === null) continue;
    if (cell.operation === "delete") deletedIds.add(cell.target_cell_id);
    else if (cell.operation === "update") updatedIds.add(cell.target_cell_id);
  }
  const cells = [
    ...originalCells.filter(
      (cell) => cell.existingCellId !== undefined && !updatedIds.has(cell.existingCellId) && !deletedIds.has(cell.existingCellId),
    ),
    ...proposedCellsToForm(submission).filter((cell) => cell.existingCellId === undefined || updatedIds.has(cell.existingCellId)),
  ];

  return {
    mode: "existing",
    action: submission.type === "delete" ? "delete" : "update",
    selectedStation: station,
    location: applyProposedLocation(toLocationValues(station.location), submission.proposedLocation),
    selectedRats: selectedRatsOf(cells),
    cells,
    originalCells,
    sectors: proposedSectors.length > 0 ? proposedSectors : originalSectors,
    originalSectors,
    submitterNote: submission.submitter_note ?? "",
    ...stationFields(applyProposedStation(toStationValues(station), submission.proposedStation)),
  };
}

function editValuesForNewStation(submission: SubmissionDetail): FormValues {
  const proposed = submission.proposedStation;
  const cells = proposedCellsToForm(submission);
  const sectors = proposedSectorsToDrafts(submission);

  return {
    ...INITIAL_VALUES,
    mode: submission.type === "new" ? "new" : "existing",
    action: submission.type === "delete" ? "delete" : "update",
    newStation: proposed
      ? {
          station_id: proposed.station_id ?? "",
          operator_id: proposed.operator_id,
          notes: proposed.notes ?? "",
          networks_id: proposed.networks_id ?? undefined,
          networks_name: proposed.networks_name ?? undefined,
          mno_name: proposed.mno_name ?? undefined,
        }
      : INITIAL_VALUES.newStation,
    uplinkType: proposed?.uplink_type ?? null,
    uplinkSpeed: proposed?.uplink_speed ?? null,
    uplinkModel: proposed?.uplink_model ?? "",
    location: applyProposedLocation(toLocationValues(null), submission.proposedLocation),
    selectedRats: selectedRatsOf(cells),
    cells,
    sectors,
    originalSectors: structuredClone(sectors),
    submitterNote: submission.submitter_note ?? "",
  };
}

function buildSubmissionData(value: FormValues, activeCells: ProposedCellForm[], photoDraft: PhotoDraft, isEditMode: boolean): SubmissionFormData {
  const isNewStation = value.mode === "new";
  const isDeleteMode = value.action === "delete";
  const hasLocation = value.location.latitude !== null && value.location.longitude !== null;
  const liveStation = isNewStation || isDeleteMode ? null : value.selectedStation;
  const station = isNewStation
    ? { ...value.newStation, uplink_type: value.uplinkType, uplink_speed: value.uplinkSpeed, uplink_model: value.uplinkModel || null }
    : liveStation
      ? diffStationValues(formStationValues(value), toStationValues(liveStation))
      : undefined;
  const location = !hasLocation
    ? undefined
    : isNewStation
      ? value.location
      : liveStation
        ? diffLocationValues(value.location, toLocationValues(liveStation.location))
        : undefined;
  const selectsLocationPhotos = !isNewStation && !isDeleteMode;
  const { photos, locationPhotoIds, locationPhotoIdsToRemove, mainLocationPhotoId } = photoDraft;

  return {
    station_id: isNewStation ? null : (value.selectedStation?.id ?? null),
    type: isDeleteMode ? "delete" : isNewStation ? "new" : "update",
    submitter_note: value.submitterNote || undefined,
    station: station && (isEditMode || hasPayloadChanges(station)) ? station : undefined,
    location: location && (isEditMode || hasPayloadChanges(location)) ? location : undefined,
    sectors: isDeleteMode ? undefined : sectorsToPayloads(value.sectors),
    cells: isDeleteMode ? [] : isNewStation ? cellsToPayloads(activeCells) : computeCellPayloads(value.originalCells, activeCells),
    pending_photos: photos.length > 0 ? photos.length : undefined,
    location_photo_ids: selectsLocationPhotos && locationPhotoIds.length > 0 ? locationPhotoIds : undefined,
    location_photo_ids_to_remove: selectsLocationPhotos && locationPhotoIdsToRemove.length > 0 ? locationPhotoIdsToRemove : undefined,
    main_location_photo_id:
      selectsLocationPhotos && mainLocationPhotoId !== null && locationPhotoIds.includes(mainLocationPhotoId) ? mainLocationPhotoId : undefined,
  };
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
  const {
    clear: clearPhotoDraft,
    clearSelections: clearPhotoSelections,
    clearUploads: clearPhotoUploads,
    loadSelections: loadPhotoSelections,
    ...photoDraft
  } = usePhotoDraft();
  const submittedValuesRef = useRef<FormValues | null>(null);

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

  const form = useForm({
    defaultValues: INITIAL_VALUES,
    onSubmit: async ({ value }) => {
      submittedValuesRef.current = structuredClone(value);
      const activeCells = value.cells.filter((c) => value.selectedRats.includes(c.rat));

      if (!isEditMode && value.mode === "new" && activeCells.length === 0 && photoDraft.photos.length === 0) {
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
        for (const msg of collectErrorMessages(errors)) toast.error(t(msg));
        return;
      }

      await mutation.mutateAsync(buildSubmissionData(value, activeCells, photoDraft, isEditMode));
    },
  });

  const mutation = useMutation({
    mutationFn: isEditMode
      ? (data: SubmissionFormData) => {
          if (!editSubmissionId) throw new Error("editSubmissionId is required for updateSubmission");
          return updateSubmission(editSubmissionId, data);
        }
      : createSubmission,
    onSuccess: (data, submittedPayload) => {
      const submittedValues = submittedValuesRef.current;
      if (photoDraft.photos.length > 0) {
        const submissionId = isEditMode && editSubmissionId ? editSubmissionId : data.id;
        const shouldRemoveFailedSubmission = !isEditMode && requiresUploadedPhoto(submittedPayload);
        const { photos, notes, mainUploadPhotoIndex } = photoDraft;
        const takenAts = photoDraft.takenAts.map((d) => d?.toISOString() ?? null);
        void trackPhotoUpload((onProgress) => uploadSubmissionPhotos(submissionId, photos, notes, takenAts, mainUploadPhotoIndex, onProgress), {
          success: t("photos.uploaded"),
          error: (error) => t(photoQualityErrorKey(error) ?? "photos.uploadFailed"),
        }).catch(() => {
          if (shouldRemoveFailedSubmission) void deleteSubmission(submissionId).catch(() => undefined);
        });
        clearPhotoUploads();
      }
      toast.success(t(isEditMode ? "toast.updated" : "toast.submitted"));
      clearPhotoSelections();
      if (isEditMode && editSubmissionId && submittedValues) {
        setOriginalState(buildOriginalState(submittedValues));
        void queryClient.invalidateQueries({ queryKey: ["submission-edit", editSubmissionId] });
        void queryClient.invalidateQueries({ queryKey: submissionDetailQueryOptions(editSubmissionId).queryKey });
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

  const loadFormValues = useCallback(
    (values: FormValues) => {
      form.reset(values, { keepDefaultValues: true });
      setOriginalState(buildOriginalState(values));
    },
    [form],
  );

  const handleModeChange = useCallback(
    (mode: SubmissionMode) => {
      form.reset({ ...INITIAL_VALUES, mode }, { keepDefaultValues: true });
      if (!isEditMode) setOriginalState({});
      clearPhotoDraft();
    },
    [clearPhotoDraft, form, isEditMode],
  );

  const handleActionChange = useCallback(
    (action: StationAction) => {
      form.setFieldValue("action", action);
      if (action === "delete") {
        form.setFieldValue("submitterNote", "");
        clearPhotoSelections();
      }
    },
    [clearPhotoSelections, form],
  );

  const loadStation = useCallback(
    (station: SearchStation | null) => {
      clearPhotoDraft();
      const { mode, submitterNote } = form.state.values;
      if (station) {
        loadFormValues({ mode, submitterNote, ...existingStationValues(station) });
        return;
      }
      form.reset({ ...INITIAL_VALUES, mode, submitterNote }, { keepDefaultValues: true });
      setOriginalState({});
    },
    [clearPhotoDraft, form, loadFormValues],
  );

  const handleUkeStationSelect = useCallback(
    (station: UkeStation) => {
      const cells = ukePermitsToCells(station.permits);
      form.setFieldValue("mode", "new");
      form.setFieldValue("selectedStation", null);
      form.setFieldValue("newStation", { station_id: station.station_id, operator_id: station.operator?.id ?? null, notes: "" });
      if (station.location) {
        form.setFieldValue("location", {
          latitude: station.location.latitude,
          longitude: station.location.longitude,
          city: station.location.city ?? "",
          address: station.location.address ?? "",
          region_id: station.location.region?.id ?? null,
        });
      }
      form.setFieldValue("cells", cells);
      form.setFieldValue("originalCells", []);
      form.setFieldValue("sectors", []);
      form.setFieldValue("originalSectors", []);
      form.setFieldValue("selectedRats", selectedRatsOf(cells));
    },
    [form],
  );

  const handleCellsChange = useCallback(
    (rat: RatType, update: (cells: ProposedCellForm[]) => ProposedCellForm[]) => {
      form.setFieldValue("cells", (cells) => [...cells.filter((cell) => cell.rat !== rat), ...update(cells.filter((cell) => cell.rat === rat))]);
    },
    [form],
  );

  const handleLocationChange = useCallback(
    (patch: Partial<ProposedLocationForm>) => {
      form.setFieldValue("location", (location) => ({ ...location, ...patch }));
    },
    [form],
  );

  const handleUplinkTypeChange = useCallback(
    (value: UplinkType | null) => {
      form.setFieldValue("uplinkType", value);
      if (!value) {
        form.setFieldValue("uplinkSpeed", null);
        form.setFieldValue("uplinkModel", "");
      }
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

    const submission = editSubmission;
    loadPhotoSelections(
      submission.locationPhotoSelections.map((photo) => photo.id),
      submission.locationPhotoRemovalSelections.map((photo) => photo.id),
      submission.locationPhotoSelections.find((photo) => photo.is_main)?.id ?? null,
    );

    queueMicrotask(() => {
      const station = submission.station;
      if (submission.type === "new" || !station) {
        loadFormValues(editValuesForNewStation(submission));
        return;
      }

      form.setFieldValue("mode", "existing");
      form.setFieldValue("action", submission.type === "delete" ? "delete" : "update");
      form.setFieldValue("submitterNote", submission.submitter_note ?? "");
      void fetchStationForSubmission(station.id).then((liveStation) => {
        if (lastAppliedEditKey.current === editKey) loadFormValues(editValuesForStation(submission, liveStation));
      });
    });
  }, [editSubmission, form, loadFormValues, loadPhotoSelections]);

  const errorValues = useSelector(form.store, (s) => (showErrors ? pickValidationValues(s.values) : null), { compare: isSameValidationValues });

  const cellErrors = useMemo(() => {
    if (!errorValues) return undefined;
    const errors = validateCells(errorValues.cells, allBands, errorValues.originalCells);
    return Object.keys(errors).length > 0 ? errors : undefined;
  }, [errorValues, allBands]);

  const formErrors = useMemo((): FormErrors => {
    if (!errorValues) return {};
    return validateForm({
      mode: errorValues.mode,
      selectedStation: errorValues.selectedStation,
      newStation: errorValues.newStation,
      location: errorValues.location,
      cells: [],
    });
  }, [errorValues]);

  const hasPhotoChanges = photoDraft.photos.length > 0 || photoDraft.locationPhotoIds.length > 0 || photoDraft.locationPhotoIdsToRemove.length > 0;

  const computeHasChanges = useCallback(
    (values: FormValues): boolean => {
      if (hasPhotoChanges) return true;
      if (hasFormChanges(values, originalState) || uplinkDiffers(values, originalState)) return true;
      if (values.mode !== "existing") return false;
      if (originalState.station && !isEqualStation(values.newStation, originalState.station)) return true;
      return (
        values.networksId !== (originalState.networksId ?? null) ||
        values.networksName !== (originalState.networksName ?? "") ||
        values.mnoName !== (originalState.mnoName ?? "")
      );
    },
    [hasPhotoChanges, originalState],
  );

  const hasChanges = useSelector(form.store, (s) => computeHasChanges(s.values));
  useBeforeUnloadGuard(hasChanges);

  return {
    form,
    mutation,
    isEditMode,
    cellErrors,
    formErrors,
    hasChanges,
    photoDraft,
    handlers: {
      handleModeChange,
      handleActionChange,
      loadStation,
      handleUkeStationSelect,
      handleCellsChange,
      handleLocationChange,
      handleUplinkTypeChange,
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
