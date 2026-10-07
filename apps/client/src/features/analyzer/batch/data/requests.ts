import type { CellApply, CellApplyAnswer, Station, Submission, SubmissionCreate } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import { createSubmissions, withdrawSubmission } from "@/features/station-editing/data/submissions";
import { API_V2_BASE, type AuditOperationHandle, JSON_HEADERS, fetchJson, fetchV2Data, isGloballyHandledError } from "@/lib/api";

const STATION_INCLUDE = "cells,sectors";
const ALWAYS_STALE = 0;
export const MOST_ITEMS_PER_REQUEST = 50;

export class BatchSendError extends Error {
  cause: unknown;
  firstItemIndex: number;

  constructor(cause: unknown, firstItemIndex: number) {
    super("The analyzer submissions could not be sent");
    this.cause = cause;
    this.firstItemIndex = firstItemIndex;
  }
}

export function batchStationQueryOptions(stationId: number, isEnabled: boolean) {
  return queryOptions({
    queryKey: ["analyzer", "batch-station", stationId] as const,
    queryFn: ({ signal }) => fetchV2Data<Station>(`stations/${stationId}?include=${STATION_INCLUDE}`, { signal }),
    staleTime: ALWAYS_STALE,
    enabled: isEnabled,
  });
}

async function sendFrom(
  items: readonly SubmissionCreate[],
  firstItemIndex: number,
  created: Submission[],
  auditOperation: AuditOperationHandle,
): Promise<void> {
  if (firstItemIndex >= items.length) return;

  try {
    created.push(...(await createSubmissions(items.slice(firstItemIndex, firstItemIndex + MOST_ITEMS_PER_REQUEST), auditOperation)));
  } catch (error) {
    if (isGloballyHandledError(error)) throw error;
    throw new BatchSendError(error, firstItemIndex);
  }
  await sendFrom(items, firstItemIndex + MOST_ITEMS_PER_REQUEST, created, auditOperation);
}

export async function sendAnalyzerSubmissions(items: readonly SubmissionCreate[], auditOperation: AuditOperationHandle): Promise<Submission[]> {
  const created: Submission[] = [];

  try {
    await sendFrom(items, 0, created, auditOperation);
  } catch (error) {
    await Promise.allSettled(created.map((submission) => withdrawSubmission(submission.id, auditOperation)));
    throw error;
  }
  return created;
}

export function applyAnalyzerChanges(body: readonly CellApply[], auditOperation: AuditOperationHandle): Promise<CellApplyAnswer> {
  return fetchJson<CellApplyAnswer>(`${API_V2_BASE}/cells/apply`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    auditOperation,
  });
}
