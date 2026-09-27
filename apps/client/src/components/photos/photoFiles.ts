export type PhotoFileFields = {
  width: number | null;
  height: number | null;
  has_thumb: boolean;
  has_full: boolean;
};

export type PhotoFile = Partial<PhotoFileFields> & { attachment_uuid: string };

export function photoUrl(attachmentUuid: string) {
  return `/uploads/${attachmentUuid}.webp`;
}

export function photoThumbUrl(photo: PhotoFile) {
  return photo.has_thumb ? `/uploads/${photo.attachment_uuid}.thumb.webp` : photoUrl(photo.attachment_uuid);
}

export function photoFullUrl(photo: PhotoFile) {
  return photo.has_full ? `/uploads/${photo.attachment_uuid}.full.avif` : undefined;
}

export function photoSize(photo: PhotoFile) {
  return photo.width && photo.height ? { width: photo.width, height: photo.height } : undefined;
}
