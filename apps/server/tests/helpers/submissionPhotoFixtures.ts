import { dbMock } from "./boundaries.js";
import { submissionId, submitterId } from "./submissionFixtures.js";

export const submissionPhotoId = "22222222-2222-4222-8222-222222222222";
export const submissionPhotoRow = {
  id: 7,
  submission_id: submissionId,
  attachment_id: 8,
  note: null,
  taken_at: null,
  is_main: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};
export const submissionPhotoView = {
  fileId: submissionPhotoId,
  width: 640,
  height: 480,
  hasThumb: false,
  hasFull: false,
  note: null,
  takenAt: null,
  isMain: false,
  createdAt: submissionPhotoRow.createdAt,
  authorId: submitterId,
  authorUsername: "contributor",
  authorName: "Private Name",
  authorImage: null,
  authorVisibility: "private",
};

export function scriptPhotoViewer(): void {
  dbMock.enqueueFor("select", "users", [{ role: "user" }]);
  dbMock.enqueueFor("select", "role_grants", []);
}
