import { queryOptions } from "@tanstack/react-query";

import type { CountryBand } from "../types";
import { REFERENCE_LIST_STALE_TIME, referenceKeys } from "./queryKeys";
import { deleteRecord, putData } from "./request";
import { type AuditOperationHandle, fetchV2Data } from "@/lib/api";

function toBandPlanPath(countryCode: string): string {
  return `countries/${encodeURIComponent(countryCode)}/bands`;
}

async function fetchBandPlan(countryCode: string, signal?: AbortSignal): Promise<number[]> {
  const entries = await fetchV2Data<CountryBand[]>(toBandPlanPath(countryCode), { signal });
  return entries.map((entry) => entry.bandId);
}

export async function addBandToPlan(countryCode: string, bandId: number, auditOperation?: AuditOperationHandle): Promise<void> {
  await putData<CountryBand>(`${toBandPlanPath(countryCode)}/${bandId}`, undefined, auditOperation);
}

export function removeBandFromPlan(countryCode: string, bandId: number): Promise<void> {
  return deleteRecord(`${toBandPlanPath(countryCode)}/${bandId}`);
}

export function bandPlanQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: referenceKeys.bandPlan(countryCode),
    queryFn: ({ signal }) => fetchBandPlan(countryCode, signal),
    staleTime: REFERENCE_LIST_STALE_TIME,
  });
}
