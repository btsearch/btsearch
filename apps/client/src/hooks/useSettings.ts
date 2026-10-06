import type { Settings } from "@openbts/shared/contract";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { fetchV2Data } from "@/lib/api";

function fetchSettings(signal: AbortSignal): Promise<Settings> {
  return fetchV2Data<Settings>("settings", { signal });
}

export function settingsQueryOptions() {
  return queryOptions({
    queryKey: ["settings"],
    queryFn: ({ signal }) => fetchSettings(signal),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });
}

export function useSettings() {
  return useQuery(settingsQueryOptions());
}
