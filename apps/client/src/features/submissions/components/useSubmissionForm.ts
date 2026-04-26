import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { fetchUkePermitsByStationId } from "@/features/map/api";
import { bandsQueryOptions } from "@/features/shared/queries";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { showApiError } from "@/lib/api";
import type { UkeStation } from "@/types/station";

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
import { cellsToPayloads, computeCellPayloads, generateCellId, ukePermitsToCells } from "../utils/cells";
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
  submitterNote: "",
  networksId: null,
  networksName: "",
  mnoName: "",
};

function stationCellsToForm(station: SearchStation): ProposedCellForm[] {
  return station.cells.map((cell) => ({
    id: generateCellId(),
    existingCellId: cell.id,
    rat: cell.rat as RatType,
    band_id: cell.band_id,
    notes: cell.notes ?? undefined,
    is_confirmed: cell.is_confirmed,
    details: cell.details ?? {},
  }));
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
      submitterNote: string,
      networksId: number | null,
      networksName: string | null,
      mnoName: string | null,
    ): boolean => {
      if (photos.length > 0) return true;
      if (locationPhotoIds.length > 0) return true;
      if (hasFormChanges({ mode, action, newStation, location, cells, submitterNote }, originalState)) return true;
      if (mode === "existing") {
        if (networksId !== (originalState.networksId ?? null)) return true;
        if (networksId !== null && networksName !== (originalState.networksName ?? "")) return true;
        if (mnoName !== (originalState.mnoName ?? "")) return true;
      }
      return false;
    },
    [originalState, photos.length, locationPhotoIds.length],
  );

  const form = useForm({
    defaultValues: INITIAL_VALUES,
    onSubmit: async ({ value }) => {
      const activeCells = value.cells.filter((c) => value.selectedRats.includes(c.rat));

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
        cells: isDeleteMode ? [] : cells,
        pending_photos: photos.length > 0 ? photos.length : undefined,
        location_photo_ids: !isNewStation && !isDeleteMode && locationPhotoIds.length > 0 ? locationPhotoIds : undefined,
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
      if (isEditMode) {
        void queryClient.invalidateQueries({ queryKey: ["submission-edit", editSubmissionId] });
      } else {
        form.reset();
        setLocationPhotoIds([]);
      }
      setShowErrors(false);
    },
    onError: (error) => {
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
      if (newMode === "existing") {
        form.setFieldValue("newStation", INITIAL_VALUES.newStation);
        form.setFieldValue("selectedStation", null);
        form.setFieldValue("cells", []);
        form.setFieldValue("originalCells", []);
        form.setFieldValue("selectedRats", []);
      } else {
        form.setFieldValue("selectedStation", null);
        form.setFieldValue("cells", []);
        form.setFieldValue("originalCells", []);
        form.setFieldValue("selectedRats", []);
      }
    },
    [form],
  );

  const handleActionChange = useCallback(
    (action: StationAction) => {
      form.setFieldValue("action", action);
      if (action === "delete") {
        form.setFieldValue("submitterNote", "");
      }
    },
    [form],
  );

  const loadStation = useCallback(
    (station: SearchStation | null) => {
      form.setFieldValue("selectedStation", station);
      form.setFieldValue("action", "update");

      if (station) {
        const cells = stationCellsToForm(station);
        form.setFieldValue("cells", cells);
        form.setFieldValue("originalCells", structuredClone(cells));
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
          setOriginalState({ location, cells: structuredClone(cells), networksId, networksName, mnoName });
        } else {
          setOriginalState({ cells: structuredClone(cells), networksId, networksName, mnoName });
        }
      } else {
        form.setFieldValue("cells", []);
        form.setFieldValue("originalCells", []);
        form.setFieldValue("selectedRats", []);
        form.setFieldValue("location", INITIAL_VALUES.location);
        form.setFieldValue("networksId", null);
        form.setFieldValue("networksName", "");
        form.setFieldValue("mnoName", "");
        setOriginalState({});
      }
    },
    [form],
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
    hasAppliedUkePreload.current = true;
    const first = preloadUkePermits[0];
    handleUkeStationSelect({
      station_id: preloadUkeStationId!,
      operator: first.operator ?? null,
      location: first.location ?? null,
      permits: preloadUkePermits,
    });
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

    const isNew = submission.type === "new";
    const proposedCells: ProposedCellForm[] = submission.cells.map((cell) => ({
      id: generateCellId(),
      existingCellId: cell.target_cell_id ?? undefined,
      rat: cell.rat as RatType,
      band_id: cell.band_id,
      notes: cell.notes ?? undefined,
      is_confirmed: cell.is_confirmed,
      details: cell.details ?? {},
    }));

    const deletedTargetIds = new Set(
      submission.cells.filter((c) => c.operation === "delete" && c.target_cell_id !== null).map((c) => c.target_cell_id),
    );
    const updatedTargetIds = new Set(
      submission.cells.filter((c) => c.operation === "update" && c.target_cell_id !== null).map((c) => c.target_cell_id),
    );

    queueMicrotask(() => {
      form.setFieldValue("mode", isNew ? "new" : "existing");
      form.setFieldValue("action", submission.type === "delete" ? "delete" : "update");
      form.setFieldValue("submitterNote", submission.submitter_note ?? "");

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
          form.setFieldValue("originalCells", originals);

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
            location: effectiveLocation,
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
          station: submission.proposedStation
            ? {
                station_id: submission.proposedStation.station_id ?? "",
                operator_id: submission.proposedStation.operator_id,
                notes: submission.proposedStation.notes ?? "",
              }
            : null,
          location: newLocation,
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
    handlers: {
      handleModeChange,
      handleActionChange,
      loadStation,
      handleUkeStationSelect,
      handleRatsChange,
      handleCellsChange,
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
