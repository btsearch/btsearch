export const photoId = "20ddf715-e424-4e63-8c73-cc1326c74b3a";

export function locationPhotoRow(overrides: Partial<LocationPhotoRow> = {}): LocationPhotoRow {
  return {
    id: 5,
    location_id: 2,
    attachment_id: 3,
    submission_id: null,
    uploaded_by: null,
    note: null,
    taken_at: null,
    createdAt: new Date("2026-10-06T10:00:00.000Z"),
    ...overrides,
  };
}

export function photoRow(overrides: Partial<PhotoRow> = {}): PhotoRow {
  return {
    locationPhotoId: 5,
    fileId: photoId,
    locationId: 2,
    width: 640,
    height: 480,
    hasThumb: true,
    hasFull: false,
    note: null,
    takenAt: null,
    createdAt: new Date("2026-10-06T10:00:00.000Z"),
    authorId: null,
    authorUsername: null,
    authorName: null,
    authorImage: null,
    authorVisibility: null,
    ...overrides,
  };
}
import type { LocationPhotoRow, PhotoRow } from "../../src/features/photos/read.js";
