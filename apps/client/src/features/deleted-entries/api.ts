import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { DELETED_ENTRY_SOURCE_TABLES } from "./constants";
import type { DeletedEntriesFilters, DeletedEntry } from "./types";
import { API_BASE, fetchJson } from "@/lib/api";

type DeletedEntriesResponse = { data: DeletedEntry[]; totalCount: number };

export function fetchDeletedEntries(filters: DeletedEntriesFilters, signal?: AbortSignal): Promise<DeletedEntriesResponse> {
  const params = new URLSearchParams({ limit: String(filters.limit), page: String(filters.page), sort: filters.sort });
  if (filters.source !== "all") {
    params.set("source_table", DELETED_ENTRY_SOURCE_TABLES[filters.source]);
    params.set("source_type", filters.source);
  }
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.search) params.set("search", filters.search);
  return fetchJson<DeletedEntriesResponse>(`${API_BASE}/deleted-entries?${params.toString()}`, { signal });
}

export function deletedEntriesQueryOptions(filters: DeletedEntriesFilters) {
  return queryOptions({
    queryKey: ["deleted-entries", filters] as const,
    queryFn: ({ signal }) => fetchDeletedEntries(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}
