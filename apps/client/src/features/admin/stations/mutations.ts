import type { StationCreate, StationUpdate } from "@openbts/shared/contract";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";

import { createStation, updateStation } from "./api";
import { createConservativeStationImpact, invalidateStationUpdateQueries } from "./queries";
import { trackPhotoUpload } from "@/components/photos/photoUploadToast";
import { stationRecordQueryOptions, uploadAndAssignStationPhotoRecords } from "@/features/station-details/station/api";
import type { StationRecord } from "@/features/station-details/station/types";
import { type AuditOperationHandle, createAuditOperationHandle } from "@/lib/api";

type StationSave = {
  stationId: number;
  body: StationUpdate;
  previousLocationId: number | null;
};

type NewStationPhotos = {
  files: readonly File[];
  notes: readonly string[];
  takenAts: readonly (Date | null)[];
};

type StationCreation = {
  body: StationCreate;
  photos: NewStationPhotos;
};

function storeSavedStation(queryClient: QueryClient, station: StationRecord, previousLocationId: number | null): void {
  queryClient.setQueryData(stationRecordQueryOptions(station.id).queryKey, station);
  invalidateStationUpdateQueries(queryClient, {
    ...createConservativeStationImpact(station.id),
    oldLocationId: previousLocationId,
    newLocationId: station.location?.id ?? null,
  });
}

function ignorePhotoFailure(): void {}

async function uploadFirstPhotos(station: StationRecord, photos: NewStationPhotos, auditOperation: AuditOperationHandle): Promise<void> {
  const locationId = station.location?.id ?? null;
  if (photos.files.length === 0 || locationId === null) return;

  await trackPhotoUpload(
    (onProgress) =>
      uploadAndAssignStationPhotoRecords({
        locationId,
        stationId: station.id,
        files: photos.files,
        notes: photos.notes,
        takenAts: photos.takenAts,
        photoIds: [],
        mainPhotoId: null,
        useFirstUploadedAsMain: true,
        onProgress,
        auditOperation,
      }),
    { error: () => i18next.t("stations:toast.photoUploadFailed") },
  ).catch(ignorePhotoFailure);
}

async function createStationWithPhotos({ body, photos }: StationCreation): Promise<StationRecord> {
  const auditOperation = createAuditOperationHandle();
  const station = await createStation(body, auditOperation);
  await uploadFirstPhotos(station, photos, auditOperation);
  return station;
}

export function useSaveStationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stationId, body }: StationSave) => updateStation(stationId, body),
    onSuccess: (station, { previousLocationId }) => storeSavedStation(queryClient, station, previousLocationId),
  });
}

export function useCreateStationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createStationWithPhotos,
    onSuccess: (station) => storeSavedStation(queryClient, station, null),
  });
}
