import type { SubmissionPhoto, SubmissionPhotoUpdate } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import { editingKeys } from "./keys";
import { API_V2_BASE, type AuditOperationHandle, JSON_HEADERS, createAuditOperationHandle, fetchJson, fetchV2Data } from "@/lib/api";

type SubmissionPhotoUploadDetails = {
  notes?: readonly string[];
  takenAts?: readonly (Date | null)[];
  mainIndex?: number | null;
  onProgress?: (sent: number, total: number) => void;
  auditOperation?: AuditOperationHandle;
};

const SUBMISSION_PHOTOS_STALE_TIME = 30_000;

function fetchSubmissionPhotos(submissionId: string, signal?: AbortSignal): Promise<SubmissionPhoto[]> {
  return fetchV2Data<SubmissionPhoto[]>(`submissions/${submissionId}/photos`, { signal });
}

export function submissionPhotosQueryOptions(submissionId: string) {
  return queryOptions({
    queryKey: editingKeys.submissionPhotos(submissionId),
    queryFn: ({ signal }) => fetchSubmissionPhotos(submissionId, signal),
    staleTime: SUBMISSION_PHOTOS_STALE_TIME,
  });
}

export function updateSubmissionPhoto(submissionId: string, photoId: string, changes: SubmissionPhotoUpdate): Promise<SubmissionPhoto> {
  return fetchV2Data<SubmissionPhoto>(`submissions/${submissionId}/photos/${photoId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(changes),
  });
}

export async function deleteSubmissionPhoto(submissionId: string, photoId: string, auditOperation?: AuditOperationHandle): Promise<void> {
  await fetchJson(`${API_V2_BASE}/submissions/${submissionId}/photos/${photoId}`, { method: "DELETE", auditOperation });
}

function removeUploadedPhotos(submissionId: string, photos: readonly SubmissionPhoto[], auditOperation: AuditOperationHandle) {
  return Promise.allSettled(photos.map((photo) => deleteSubmissionPhoto(submissionId, photo.id, auditOperation)));
}

function listUploadOrder(fileCount: number, mainIndex: number | null): number[] {
  const order = Array.from({ length: fileCount }, (_, index) => index).filter((index) => index !== mainIndex);
  if (mainIndex !== null && mainIndex >= 0 && mainIndex < fileCount) order.push(mainIndex);
  return order;
}

export async function uploadSubmissionPhotos(
  submissionId: string,
  files: readonly File[],
  { notes, takenAts, mainIndex = null, onProgress, auditOperation = createAuditOperationHandle() }: SubmissionPhotoUploadDetails = {},
): Promise<SubmissionPhoto[]> {
  const uploadOrder = listUploadOrder(files.length, mainIndex);
  const uploaded: SubmissionPhoto[] = [];

  try {
    for (const [sent, index] of uploadOrder.entries()) {
      const file = files[index];
      if (file === undefined) continue;
      onProgress?.(sent, uploadOrder.length);
      const formData = new FormData();
      formData.append("notes", notes?.[index] ?? "");
      formData.append("takenAts", takenAts?.[index]?.toISOString() ?? "");
      formData.append("isMains", String(index === mainIndex));
      formData.append("files", file);
      // oxlint-disable-next-line no-await-in-loop -- One photo per request keeps each upload under Cloudflare's body limit and the API timeout.
      const photos = await fetchV2Data<SubmissionPhoto[]>(`submissions/${submissionId}/photos`, { method: "POST", body: formData, auditOperation });
      uploaded.push(...photos);
    }
    onProgress?.(uploadOrder.length, uploadOrder.length);
  } catch (error) {
    await removeUploadedPhotos(submissionId, uploaded, auditOperation);
    throw error;
  }
  return uploaded;
}
