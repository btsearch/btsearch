import type { List, ListList } from "@openbts/shared/contract";
import { type QueryClient, keepPreviousData, queryOptions } from "@tanstack/react-query";

import { listKeys } from "@/features/lists/api";
import { API_V2_BASE, fetchJson } from "@/lib/api";

export type AdminListsParams = {
  search: string;
  isPublic: boolean | null;
  ownerIds: readonly string[];
  limit: number;
  offset: number;
};

type AdminLists = {
  lists: List[];
  total: number;
};

const ADMIN_LISTS_ROOT = ["admin", "lists"] as const;

async function fetchAdminLists(params: AdminListsParams, signal?: AbortSignal): Promise<AdminLists> {
  const { search, isPublic, ownerIds, limit, offset } = params;
  const query = new URLSearchParams({ owners: "all", include: "owner", includeTotal: "true", limit: String(limit), offset: String(offset) });
  if (search !== "") query.set("q", search);
  if (isPublic !== null) query.set("isPublic", String(isPublic));
  if (ownerIds.length > 0) query.set("ownerIds", ownerIds.join(","));

  const page = await fetchJson<ListList>(`${API_V2_BASE}/lists?${query.toString()}`, { signal });
  return { lists: page.data, total: page.paging.total ?? page.data.length };
}

export function adminListsQueryOptions(params: AdminListsParams) {
  return queryOptions({
    queryKey: [...ADMIN_LISTS_ROOT, "page", params] as const,
    queryFn: ({ signal }) => fetchAdminLists(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export async function refreshChangedListQueries(queryClient: QueryClient, listId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ADMIN_LISTS_ROOT }),
    queryClient.invalidateQueries({ queryKey: listKeys.ownLists() }),
    queryClient.invalidateQueries({ queryKey: listKeys.list(listId) }),
  ]);
}

export async function discardDeletedListQueries(queryClient: QueryClient, listId: string): Promise<void> {
  queryClient.removeQueries({ queryKey: listKeys.list(listId) });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ADMIN_LISTS_ROOT }),
    queryClient.invalidateQueries({ queryKey: listKeys.ownLists() }),
  ]);
}
