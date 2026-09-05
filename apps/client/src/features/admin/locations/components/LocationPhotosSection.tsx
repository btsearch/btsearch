import { PhotosSection } from "@/components/photos/photosSection";
import {
  deleteLocationPhoto,
  fetchLocationPhotos,
  updateLocationPhotoNote,
  updateLocationPhotoTakenAt,
  uploadLocationPhotos,
} from "@/features/station-details/api";

type Props = { locationId: number };

export function LocationPhotosSection({ locationId }: Props) {
  return (
    <PhotosSection
      queryKey={["location-photos", locationId]}
      fetchFn={() => fetchLocationPhotos(locationId)}
      deleteFn={(id) => deleteLocationPhoto(locationId, id)}
      updateNoteFn={(id, note) => updateLocationPhotoNote(locationId, id, note)}
      updateTakenAtFn={(id, takenAt) => updateLocationPhotoTakenAt(locationId, id, takenAt)}
      uploadFn={(files) => uploadLocationPhotos(locationId, files)}
    />
  );
}
