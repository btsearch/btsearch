import type { Photo, UserRef } from "@openbts/shared/contract";

export type PhotoAuthor = Pick<UserRef, "username" | "name" | "image">;

export type PhotoView = Pick<Photo, "id" | "urls" | "width" | "height" | "note" | "takenAt" | "createdAt"> & {
  author: PhotoAuthor | null;
};

export type PhotoSize = { width: number; height: number };

const DOWNLOAD_NAME_PREFIX = "btsearch-";
const FULL_VERSION_EXTENSION = "avif";
const DISPLAY_VERSION_EXTENSION = "webp";

export function hasPhotoThumbnail(photo: Pick<PhotoView, "urls">): boolean {
  return photo.urls.thumb !== photo.urls.display;
}

export function hasFullPhotoVersion(photo: Pick<PhotoView, "urls">): boolean {
  return photo.urls.full !== photo.urls.display;
}

export function photoSize(photo: Pick<PhotoView, "width" | "height">): PhotoSize | undefined {
  if (photo.width === null || photo.height === null || photo.width <= 0 || photo.height <= 0) return undefined;
  return { width: photo.width, height: photo.height };
}

export function photoDownloadName(photo: Pick<PhotoView, "id" | "urls">): string {
  const extension = hasFullPhotoVersion(photo) ? FULL_VERSION_EXTENSION : DISPLAY_VERSION_EXTENSION;
  return `${DOWNLOAD_NAME_PREFIX}${photo.id}.${extension}`;
}
