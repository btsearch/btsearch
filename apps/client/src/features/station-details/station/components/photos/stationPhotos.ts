import type { PhotoRecord } from "../../types";

export type ShownPhoto = PhotoRecord & { isMain: boolean };

export function isMainPhoto(photo: Pick<PhotoRecord, "selections">, stationId: number): boolean {
  return photo.selections.some((selection) => selection.stationId === stationId && selection.isMain);
}

export function listShownPhotos(photos: readonly PhotoRecord[], stationId: number): ShownPhoto[] {
  return photos.map((photo) => ({ ...photo, isMain: isMainPhoto(photo, stationId) }));
}
