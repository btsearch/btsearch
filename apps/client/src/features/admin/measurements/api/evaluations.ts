import type { ObservationEvaluationDetail, ObservationEvaluationList } from "@openbts/shared/contract";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { measurementsAdminKeys } from "./keys";
import { API_V2_BASE, NOT_FOUND_STATUS, fetchJson } from "@/lib/api";

const EVALUATIONS_PAGE_SIZE = 14;

function fetchEvaluationPage(cursor: string | null, signal: AbortSignal): Promise<ObservationEvaluationList> {
  const query = new URLSearchParams({ limit: String(EVALUATIONS_PAGE_SIZE) });
  if (cursor !== null) query.set("cursor", cursor);
  return fetchJson<ObservationEvaluationList>(`${API_V2_BASE}/observed/evaluations?${query.toString()}`, { signal });
}

async function fetchEvaluation(id: number, signal: AbortSignal): Promise<ObservationEvaluationDetail | null> {
  const response = await fetchJson<{ data: ObservationEvaluationDetail } | null>(`${API_V2_BASE}/observed/evaluations/${id}`, {
    signal,
    allowedErrors: [NOT_FOUND_STATUS],
  });
  return response?.data ?? null;
}

export function evaluationsQueryOptions() {
  return infiniteQueryOptions({
    queryKey: measurementsAdminKeys.evaluations(),
    queryFn: ({ pageParam, signal }) => fetchEvaluationPage(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.paging.nextCursor,
    staleTime: 0,
  });
}

export function evaluationQueryOptions(id: number) {
  return queryOptions({
    queryKey: measurementsAdminKeys.evaluation(id),
    queryFn: ({ signal }) => fetchEvaluation(id, signal),
  });
}
