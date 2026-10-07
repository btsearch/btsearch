import { useState } from "react";

import type { PhotoPicks } from "@/features/station-editing/model/bodies";

export const NO_PHOTO_PICKS: PhotoPicks = { selectIds: [], removeIds: [], mainPhotoId: null };

export function usePhotoDraft(storedPicks: PhotoPicks) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [takenAts, setTakenAts] = useState<(Date | null)[]>([]);
  const [locationPhotoIds, setLocationPhotoIds] = useState<string[]>(() => [...storedPicks.selectIds]);
  const [locationPhotoIdsToRemove, setLocationPhotoIdsToRemove] = useState<string[]>(() => [...storedPicks.removeIds]);
  const [mainLocationPhotoId, setMainLocationPhotoId] = useState<string | null>(storedPicks.mainPhotoId);
  const [mainUploadPhotoIndex, setMainUploadPhotoIndex] = useState<number | null>(null);

  function clearUploads() {
    setPhotos([]);
    setNotes([]);
    setTakenAts([]);
    setMainUploadPhotoIndex(null);
  }

  return {
    photos,
    onPhotosChange: setPhotos,
    notes,
    onNotesChange: setNotes,
    takenAts,
    onTakenAtsChange: setTakenAts,
    locationPhotoIds,
    onLocationPhotoIdsChange: setLocationPhotoIds,
    locationPhotoIdsToRemove,
    onLocationPhotoIdsToRemoveChange: setLocationPhotoIdsToRemove,
    mainLocationPhotoId,
    onMainLocationPhotoIdChange: setMainLocationPhotoId,
    mainUploadPhotoIndex,
    onMainUploadPhotoIndexChange: setMainUploadPhotoIndex,
    clearUploads,
  };
}

export type PhotoDraft = ReturnType<typeof usePhotoDraft>;

export function toPhotoPicks({
  locationPhotoIds,
  locationPhotoIdsToRemove,
  mainLocationPhotoId,
}: Pick<PhotoDraft, "locationPhotoIds" | "locationPhotoIdsToRemove" | "mainLocationPhotoId">): PhotoPicks {
  if (mainLocationPhotoId === null || locationPhotoIds.includes(mainLocationPhotoId)) {
    return { selectIds: locationPhotoIds, removeIds: locationPhotoIdsToRemove, mainPhotoId: mainLocationPhotoId };
  }
  return { selectIds: [...locationPhotoIds, mainLocationPhotoId], removeIds: locationPhotoIdsToRemove, mainPhotoId: mainLocationPhotoId };
}
