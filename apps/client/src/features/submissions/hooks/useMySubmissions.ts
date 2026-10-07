import type { Submission, SubmissionList, SubmissionStatus } from "@openbts/shared/contract";
import { useInfiniteQuery } from "@tanstack/react-query";

import { editingKeys } from "@/features/station-editing/data/keys";
import { API_V2_BASE, appendList, fetchJson } from "@/lib/api";

export type MySubmissionsFilters = {
  status: SubmissionStatus | null;
  countryCodes: readonly string[];
  operatorIds: readonly number[];
  search: string;
};

type MySubmissionsPage = {
  submissions: Submission[];
  total: number;
};

const PAGE_SIZE = 20;
const SEARCH_MAX_LENGTH = 100;
const EVERY_STATUS = "all";

function toSearchText(search: string): string {
  return search.trim().slice(0, SEARCH_MAX_LENGTH);
}

async function fetchMySubmissions(filters: MySubmissionsFilters, offset: number, signal?: AbortSignal): Promise<MySubmissionsPage> {
  const params = new URLSearchParams({ include: "station", includeTotal: "true", limit: String(PAGE_SIZE), offset: String(offset) });
  const search = toSearchText(filters.search);
  if (filters.status !== null) params.set("statuses", filters.status);
  appendList(params, "operatorIds", filters.operatorIds);
  appendList(params, "countryCodes", filters.countryCodes);
  if (search !== "") params.set("q", search);

  const response = await fetchJson<SubmissionList>(`${API_V2_BASE}/submissions?${params.toString()}`, { signal });
  return { submissions: response.data, total: response.paging.total ?? response.data.length };
}

export function useMySubmissions(userId: string | undefined, filters: MySubmissionsFilters, isEnabled: boolean) {
  return useInfiniteQuery({
    queryKey: editingKeys.mySubmissions(
      userId,
      filters.status ?? EVERY_STATUS,
      filters.operatorIds,
      toSearchText(filters.search),
      filters.countryCodes,
    ),
    queryFn: ({ pageParam, signal }) => fetchMySubmissions(filters, pageParam, signal),
    initialPageParam: 0,
    enabled: userId !== undefined && isEnabled,
    getNextPageParam: (lastPage, allPages) => {
      const fetchedCount = allPages.length * PAGE_SIZE;
      return fetchedCount < lastPage.total ? fetchedCount : undefined;
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
}
