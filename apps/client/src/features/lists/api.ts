import type { List, ListCreate, ListItems, ListOperatorCount, ListUpdate, Me, Paging } from "@openbts/shared/contract";
import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";

import { API_V2_BASE, JSON_HEADERS, fetchJson, fetchV2Data } from "@/lib/api";
import { meQueryOptions } from "@/lib/auth/me";

export type ListWithItems = Omit<List, "items" | "owner" | "operatorCounts"> & { items: ListItems };
export type OwnList = ListWithItems & { operatorCounts: ListOperatorCount[] };

type OwnLists = {
  lists: OwnList[];
  total: number;
};

type OwnListPage = { data: OwnList[]; paging: Paging };

export const LIST_NAME_MAX_LENGTH = 100;
export const LIST_DESCRIPTION_MAX_LENGTH = 1000;

export const listKeys = {
  ownLists: () => ["user-lists"] as const,
  everyList: () => ["list"] as const,
  list: (listId: string) => ["list", listId] as const,
};

const LIST_INCLUDE = "items";
const OWN_LISTS_INCLUDE = "items,operatorCounts";
const OWN_LISTS_LIMIT = 50;

async function fetchOwnLists(signal?: AbortSignal): Promise<OwnLists> {
  const params = new URLSearchParams({ include: OWN_LISTS_INCLUDE, limit: String(OWN_LISTS_LIMIT), includeTotal: "true" });
  const page = await fetchJson<OwnListPage>(`${API_V2_BASE}/lists?${params.toString()}`, { signal });
  return { lists: page.data, total: page.paging.total ?? page.data.length };
}

function fetchList(listId: string, signal?: AbortSignal): Promise<ListWithItems> {
  return fetchV2Data<ListWithItems>(`lists/${encodeURIComponent(listId)}?include=${LIST_INCLUDE}`, { signal });
}

function readListLimit(me: Me): number {
  return me.limits.lists;
}

export function createOwnList(list: ListCreate): Promise<List> {
  return fetchV2Data<List>("lists", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(list) });
}

export function updateList(listId: string, change: ListUpdate): Promise<List> {
  return fetchV2Data<List>(`lists/${encodeURIComponent(listId)}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(change) });
}

export async function deleteList(listId: string): Promise<void> {
  await fetchJson(`${API_V2_BASE}/lists/${encodeURIComponent(listId)}`, { method: "DELETE" });
}

export function ownListsQueryOptions() {
  return queryOptions({
    queryKey: [...listKeys.ownLists(), "mine", "v2", OWN_LISTS_INCLUDE] as const,
    queryFn: ({ signal }) => fetchOwnLists(signal),
  });
}

export function listQueryOptions(listId: string) {
  return queryOptions({
    queryKey: [...listKeys.list(listId), "v2", LIST_INCLUDE] as const,
    queryFn: listId === "" ? skipToken : ({ signal }) => fetchList(listId, signal),
  });
}

export function listLimitQueryOptions(userId: string) {
  return queryOptions({ ...meQueryOptions(userId), select: readListLimit });
}

export function prefetchOwnLists(queryClient: QueryClient, userId: string): void {
  void queryClient.prefetchQuery(ownListsQueryOptions());
  void queryClient.prefetchQuery(meQueryOptions(userId));
}
