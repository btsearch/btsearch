import type { Submission, SubmissionCreate, SubmissionReview, SubmissionUpdate } from "@openbts/shared/contract";
import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { editingKeys } from "./keys";
import { API_V2_BASE, type AuditOperationHandle, JSON_HEADERS, fetchJson, fetchV2Data } from "@/lib/api";

const SUBMISSION_INCLUDE = "station";
const SUBMISSION_STALE_TIME = 30_000;

function fetchSubmission(submissionId: string, signal?: AbortSignal): Promise<Submission> {
  return fetchV2Data<Submission>(`submissions/${submissionId}?include=${SUBMISSION_INCLUDE}`, { signal });
}

export function submissionQueryOptions(submissionId: string) {
  return queryOptions({
    queryKey: editingKeys.submission(submissionId),
    queryFn: ({ signal }) => fetchSubmission(submissionId, signal),
    staleTime: SUBMISSION_STALE_TIME,
  });
}

export function createSubmissions(items: readonly SubmissionCreate[], auditOperation?: AuditOperationHandle): Promise<Submission[]> {
  return fetchV2Data<Submission[]>("submissions", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(items), auditOperation });
}

export function updateSubmission(submissionId: string, body: SubmissionUpdate, auditOperation?: AuditOperationHandle): Promise<Submission> {
  return fetchV2Data<Submission>(`submissions/${submissionId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    auditOperation,
  });
}

export async function withdrawSubmission(submissionId: string, auditOperation?: AuditOperationHandle): Promise<void> {
  await fetchJson(`${API_V2_BASE}/submissions/${submissionId}`, { method: "DELETE", auditOperation });
}

export function reviewSubmission(submissionId: string, body: SubmissionReview, auditOperation?: AuditOperationHandle): Promise<Submission> {
  return fetchV2Data<Submission>(`submissions/${submissionId}/review`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    auditOperation,
  });
}

function withCachedStation(submission: Submission, cached: Submission): Submission {
  return cached.station === undefined ? submission : { ...submission, station: cached.station };
}

export function storeSubmission(queryClient: QueryClient, submission: Submission): void {
  queryClient.setQueryData(submissionQueryOptions(submission.id).queryKey, (cached) =>
    cached === undefined ? undefined : withCachedStation(submission, cached),
  );
}

export function invalidateSubmissionQueries(queryClient: QueryClient, submissionId?: string): Promise<void[]> {
  const submissionKey = submissionId === undefined ? editingKeys.submissionRoot : editingKeys.submission(submissionId);
  const photosKey = submissionId === undefined ? editingKeys.submissionPhotosRoot : editingKeys.submissionPhotosOf(submissionId);

  return Promise.all([
    queryClient.invalidateQueries({ queryKey: submissionKey }),
    queryClient.invalidateQueries({ queryKey: photosKey }),
    queryClient.invalidateQueries({ queryKey: editingKeys.mySubmissionsRoot }),
    queryClient.invalidateQueries({ queryKey: editingKeys.adminSubmissionsRoot }),
    queryClient.invalidateQueries({ queryKey: editingKeys.pendingSubmissionsCount }),
    queryClient.invalidateQueries({ queryKey: editingKeys.dashboardPendingSubmissions }),
  ]);
}
