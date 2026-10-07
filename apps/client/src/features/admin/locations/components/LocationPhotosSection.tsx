import { useQueryClient } from "@tanstack/react-query";

import { type PhotoChanges, PhotosSection } from "@/components/photos/photosSection";
import {
  deleteLocationPhotoRecord,
  fetchLocationPhotoRecords,
  invalidateStationPhotoLists,
  stationWindowKeys,
  updateLocationPhotoRecord,
  uploadLocationPhotoRecords,
} from "@/features/station-details/station/api";
import type { PhotoRecord } from "@/features/station-details/station/types";

type Props = { locationId: number };

export function LocationPhotosSection({ locationId }: Props) {
  const queryClient = useQueryClient();

  async function deletePhoto(photo: PhotoRecord) {
    await deleteLocationPhotoRecord(locationId, photo.id);
    void invalidateStationPhotoLists(queryClient, photo);
  }

  async function updatePhoto(photo: PhotoRecord, changes: PhotoChanges) {
    await updateLocationPhotoRecord(locationId, photo.id, changes);
    void invalidateStationPhotoLists(queryClient, photo);
  }

  return (
    <PhotosSection
      queryKey={stationWindowKeys.locationPhotos(locationId)}
      invalidateKey={["location-photos", locationId]}
      fetchFn={() => fetchLocationPhotoRecords(locationId)}
      toPhoto={(photo) => photo}
      deleteFn={deletePhoto}
      updateFn={updatePhoto}
      uploadFn={(files, onProgress) => uploadLocationPhotoRecords(locationId, files, { onProgress })}
    />
  );
}
