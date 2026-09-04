import { queryOptions, useQuery } from "@tanstack/react-query";

import type { RuntimeSettings } from "@/features/admin/settings/api";
import { fetchApiData } from "@/lib/api";

export type { RuntimeSettings, Announcement } from "@/features/admin/settings/api";

const fetchSettings = () =>
  fetchApiData<RuntimeSettings>("settings", {
    allowedErrors: [403, 404],
  }).then((data) => data ?? null);

export function settingsQueryOptions() {
  return queryOptions({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });
}

export function useSettings() {
  return useQuery(settingsQueryOptions());
}
