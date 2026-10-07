import type { SubmissionList } from "@openbts/shared/contract";

import { API_V2_BASE, fetchJson } from "@/lib/api";

export const QUEUE_PAGE_SIZE = 25;

const SUBMISSION_QUEUE_QUERY = `submitters=all&statuses=pending&sort=createdAt&include=station.location&limit=${QUEUE_PAGE_SIZE}&includeTotal=true`;

export function fetchPendingSubmissionQueue(signal?: AbortSignal): Promise<SubmissionList> {
  return fetchJson<SubmissionList>(`${API_V2_BASE}/submissions?${SUBMISSION_QUEUE_QUERY}`, { signal });
}
