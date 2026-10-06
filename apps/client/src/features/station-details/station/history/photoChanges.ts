import type { HistoryPhotosPart, StationHistoryPhoto } from "./types";

export type HistoryPhotoMark = { photo: StationHistoryPhoto; isMain: boolean };
type HistoryPhotoLine = { key: string; from: HistoryPhotoMark | null; to: HistoryPhotoMark | null };

const SHORT_PHOTO_ID_LENGTH = 8;
const NOT_LISTED = -1;

export function getShortPhotoId(photoId: string): string {
  return photoId.slice(0, SHORT_PHOTO_ID_LENGTH);
}

function findMainPhotoPosition(photos: readonly StationHistoryPhoto[], mainPhoto: StationHistoryPhoto | null): number {
  if (mainPhoto === null) return NOT_LISTED;
  return photos.findIndex((photo) => photo.id === mainPhoto.id);
}

export function describePhotoChanges(part: HistoryPhotosPart): HistoryPhotoLine[] {
  const mainFrom = part.main?.from ?? null;
  const mainTo = part.main?.to ?? null;
  const mainFromPosition = findMainPhotoPosition(part.removed, mainFrom);
  const mainToPosition = findMainPhotoPosition(part.added, mainTo);
  const lines: HistoryPhotoLine[] = [
    ...part.removed.map((photo, position) => ({ key: `removed-${position}`, from: { photo, isMain: position === mainFromPosition }, to: null })),
    ...part.added.map((photo, position) => ({ key: `added-${position}`, from: null, to: { photo, isMain: position === mainToPosition } })),
  ];

  const unlistedMainFrom = mainFrom === null || mainFromPosition !== NOT_LISTED ? null : { photo: mainFrom, isMain: true };
  const unlistedMainTo = mainTo === null || mainToPosition !== NOT_LISTED ? null : { photo: mainTo, isMain: true };
  if (unlistedMainFrom !== null || unlistedMainTo !== null) lines.push({ key: "main", from: unlistedMainFrom, to: unlistedMainTo });
  return lines;
}
