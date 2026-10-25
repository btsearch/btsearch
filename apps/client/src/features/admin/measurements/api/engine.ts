import type { EngineRun, EngineRunCreate, EngineState } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import { measurementsAdminKeys } from "./keys";
import { JSON_HEADERS, fetchV2Data } from "@/lib/api";

const ENGINE_REFRESH_MS = 15_000;

export function engineStateQueryOptions() {
  return queryOptions({
    queryKey: measurementsAdminKeys.engine(),
    queryFn: ({ signal }) => fetchV2Data<EngineState>("observed/engine", { signal }),
    staleTime: 0,
    refetchInterval: ENGINE_REFRESH_MS,
  });
}

export function startEngineRun(run: EngineRunCreate): Promise<EngineRun> {
  return fetchV2Data<EngineRun>("observed/engine/runs", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(run) });
}
