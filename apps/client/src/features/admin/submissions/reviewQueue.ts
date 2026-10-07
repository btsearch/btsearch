import type { Submission, SubmissionList } from "@openbts/shared/contract";
import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { editingKeys } from "@/features/station-editing/data/keys";
import { submissionQueryOptions } from "@/features/station-editing/data/submissions";
import { API_V2_BASE, fetchJson } from "@/lib/api";

export type QueuedSubmission = Pick<Submission, "id" | "createdAt">;

type ReviewQueue = {
  total: number;
  place: number | null;
  previous: Submission | null;
  next: Submission | null;
};

const SAME_INSTANT_REACH = 51;
const QUEUE_STALE_TIME = 30_000;
const UNKNOWN_AGE = 0;

function fetchPendingPage(page: Record<string, string>, signal?: AbortSignal): Promise<SubmissionList> {
  const params = new URLSearchParams({ submitters: "all", statuses: "pending", includeTotal: "true", ...page });
  return fetchJson<SubmissionList>(`${API_V2_BASE}/submissions?${params.toString()}`, { signal });
}

async function fetchReviewQueue({ id, createdAt }: QueuedSubmission, signal?: AbortSignal): Promise<ReviewQueue> {
  const fromHere = await fetchPendingPage({ sort: "createdAt", createdAfter: createdAt, limit: String(SAME_INSTANT_REACH) }, signal);
  const ownIndex = fromHere.data.findIndex((submission) => submission.id === id);
  const fromHereTotal = fromHere.paging.total ?? fromHere.data.length;
  const notBeforeCount = ownIndex === -1 ? fromHereTotal : fromHereTotal - ownIndex;
  const before = await fetchPendingPage({ sort: "-createdAt", offset: String(notBeforeCount), limit: "1" }, signal);
  const total = before.paging.total ?? fromHereTotal;

  return {
    total,
    place: ownIndex === -1 ? null : total - notBeforeCount + 1,
    previous: before.data.at(0) ?? null,
    next: fromHere.data.at(ownIndex + 1) ?? null,
  };
}

export function reviewQueueQueryOptions(submission: QueuedSubmission) {
  return queryOptions({
    queryKey: editingKeys.reviewQueue(submission.id, submission.createdAt),
    queryFn: ({ signal }) => fetchReviewQueue(submission, signal),
    staleTime: QUEUE_STALE_TIME,
  });
}

export function seedQueuedSubmission(queryClient: QueryClient, submission: Submission): void {
  const { queryKey } = submissionQueryOptions(submission.id);
  if (queryClient.getQueryState(queryKey) === undefined) queryClient.setQueryData(queryKey, submission, { updatedAt: UNKNOWN_AGE });
}
