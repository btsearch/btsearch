import { queryOptions, useQuery } from "@tanstack/react-query";

import { fetchSubmissionForEdit } from "./api";

const SUBMISSION_DETAIL_STALE_TIME = 1000 * 60 * 2;

export function submissionDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["my-submission", "detail", id],
    queryFn: () => fetchSubmissionForEdit(id),
    staleTime: SUBMISSION_DETAIL_STALE_TIME,
  });
}

export const useBatchDetail = (id: string) =>
  useQuery({ queryKey: ["submissionBatches", "details", id], queryFn: () => fetchSubmissionForEdit(id), enabled: !!id });
