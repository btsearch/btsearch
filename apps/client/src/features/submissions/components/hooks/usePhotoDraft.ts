import { useCallback, useState } from "react";

export function usePhotoDraft() {
  const [photos, setPhotos] = useState<File[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [takenAts, setTakenAts] = useState<(Date | null)[]>([]);
  const [locationPhotoIds, setLocationPhotoIds] = useState<number[]>([]);
  const [locationPhotoIdsToRemove, setLocationPhotoIdsToRemove] = useState<number[]>([]);
  const [mainLocationPhotoId, setMainLocationPhotoId] = useState<number | null>(null);
  const [mainUploadPhotoIndex, setMainUploadPhotoIndex] = useState<number | null>(null);

  const clearSelections = useCallback(() => {
    setLocationPhotoIds([]);
    setLocationPhotoIdsToRemove([]);
    setMainLocationPhotoId(null);
    setMainUploadPhotoIndex(null);
  }, []);

  const clearUploads = useCallback(() => {
    setPhotos([]);
    setNotes([]);
    setTakenAts([]);
    setMainUploadPhotoIndex(null);
  }, []);

  const clear = useCallback(() => {
    clearSelections();
    clearUploads();
  }, [clearSelections, clearUploads]);

  const loadSelections = useCallback((selectedIds: number[], removedIds: number[], mainId: number | null) => {
    setLocationPhotoIds(selectedIds);
    setLocationPhotoIdsToRemove(removedIds);
    setMainLocationPhotoId(mainId);
  }, []);

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
    clear,
    clearSelections,
    clearUploads,
    loadSelections,
  };
}

export type PhotoDraft = Omit<ReturnType<typeof usePhotoDraft>, "clear" | "clearSelections" | "clearUploads" | "loadSelections">;
