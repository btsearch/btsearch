import type { Paging, UserRef } from "@openbts/shared/contract";
import { type QueryClient, infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";

import { userAdminKeys } from "../api/queryKeys";
import { toUniqueSorted } from "../utils/ids";
import { parseUserId } from "../utils/userId";
import { API_V2_BASE, fetchJson } from "@/lib/api";
import { splitIntoChunks } from "@/lib/splitIntoChunks";

export type PickerUser = UserRef;

type PickerUserPage = { data: PickerUser[]; paging: Paging };

export const PICKER_SEARCH_MIN_LENGTH = 2;

const PICKER_PAGE_SIZE = 25;
const PICKER_IDS_PER_REQUEST = 100;

function fetchPickerUserPage(search: string, cursor: string | null, signal: AbortSignal): Promise<PickerUserPage> {
  const params = new URLSearchParams({ q: search, limit: String(PICKER_PAGE_SIZE) });
  if (cursor !== null) params.set("cursor", cursor);
  return fetchJson<PickerUserPage>(`${API_V2_BASE}/users?${params.toString()}`, { signal });
}

function fetchPickerUserChunk(ids: string[], signal: AbortSignal): Promise<PickerUserPage> {
  const params = new URLSearchParams({ ids: ids.join(","), limit: String(PICKER_IDS_PER_REQUEST) });
  return fetchJson<PickerUserPage>(`${API_V2_BASE}/users?${params.toString()}`, { signal });
}

async function fetchPickerUsersByIds(ids: string[], signal: AbortSignal): Promise<PickerUser[]> {
  const chunks = splitIntoChunks(ids, PICKER_IDS_PER_REQUEST);
  const pages = await Promise.all(chunks.map((chunk) => fetchPickerUserChunk(chunk, signal)));
  return pages.flatMap((page) => page.data);
}

export function pickerSearchQueryOptions(search: string) {
  return infiniteQueryOptions({
    queryKey: [...userAdminKeys.pickers(), "search", search] as const,
    queryFn: ({ pageParam, signal }) => fetchPickerUserPage(search, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.paging.nextCursor,
    enabled: search.length >= PICKER_SEARCH_MIN_LENGTH,
  });
}

export function pickerSelectedUsersQueryOptions(selectedUserIds: readonly string[]) {
  const lookupIds = toUniqueSorted(selectedUserIds.flatMap((selectedUserId) => parseUserId(selectedUserId) ?? []));
  return queryOptions({
    queryKey: [...userAdminKeys.pickers(), "selected", lookupIds] as const,
    queryFn: ({ signal }) => fetchPickerUsersByIds(lookupIds, signal),
    enabled: lookupIds.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function primePickerSelectedUsers(queryClient: QueryClient, users: PickerUser[]): void {
  queryClient.setQueryData(pickerSelectedUsersQueryOptions(users.map((user) => user.id)).queryKey, users);
}
