import type { HunterList } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import { API_V2_BASE, fetchAllPages, fetchJson } from "@/lib/api";

const HUNTERS_PAGE_SIZE = 200;

function huntersPagePath(cursor: string | undefined): string {
  const params = new URLSearchParams({ limit: String(HUNTERS_PAGE_SIZE) });
  if (cursor !== undefined) params.set("cursor", cursor);
  return `${API_V2_BASE}/hunters?${params.toString()}`;
}

export function huntersQueryOptions() {
  return queryOptions({
    queryKey: ["hunters", "v2"] as const,
    queryFn: ({ signal }) => fetchAllPages((cursor) => fetchJson<HunterList>(huntersPagePath(cursor), { signal })),
  });
}
