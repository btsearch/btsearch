import type { ListedUser, UserList } from "@openbts/shared/contract";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import type { AdminListedUser, NamedUserRef, UserListParams, UserRef } from "../types";
import { resolveDisplayName } from "../utils/identity";
import { toUniqueSorted } from "../utils/ids";
import { USER_ROLES } from "../utils/roles";
import { userAdminKeys } from "./queryKeys";
import { API_V2_BASE, fetchJson } from "@/lib/api";
import { splitIntoChunks } from "@/lib/splitIntoChunks";

const USER_IDS_PER_REQUEST = 100;

function normalizeUserListParams(params: UserListParams): UserListParams {
  return {
    search: params.search.trim(),
    roles: USER_ROLES.filter((role) => params.roles.includes(role)),
    isBanned: params.isBanned,
    sort: params.sort,
    limit: params.limit,
    offset: params.offset,
  };
}

function toNamedUserRef(user: UserRef): NamedUserRef {
  return { id: user.id, username: user.username, name: resolveDisplayName(user), image: user.image };
}

function toAdminListedUser(user: ListedUser): AdminListedUser {
  if (user.account === undefined) throw new Error("The user list came back without account details");
  return { ...toNamedUserRef(user), account: user.account };
}

async function fetchUserRefs(userIds: readonly string[], signal?: AbortSignal): Promise<NamedUserRef[]> {
  const query = new URLSearchParams({ ids: userIds.join(","), limit: String(USER_IDS_PER_REQUEST) });
  const response = await fetchJson<UserList>(`${API_V2_BASE}/users?${query.toString()}`, { signal });
  return response.data.map(toNamedUserRef);
}

async function fetchUserList(params: UserListParams, signal?: AbortSignal): Promise<{ users: AdminListedUser[]; total: number }> {
  const { search, roles, isBanned, sort, limit, offset } = params;
  const query = new URLSearchParams({ include: "account", includeTotal: "true", sort, limit: String(limit), offset: String(offset) });
  if (search !== "") query.set("q", search);
  if (roles.length > 0) query.set("roles", roles.join(","));
  if (isBanned !== null) query.set("isBanned", String(isBanned));

  const response = await fetchJson<UserList>(`${API_V2_BASE}/users?${query.toString()}`, { signal });
  const users = response.data.map(toAdminListedUser);
  return { users, total: response.paging.total ?? users.length };
}

async function fetchUsersByIds(userIds: readonly string[], signal?: AbortSignal): Promise<NamedUserRef[]> {
  const chunks = splitIntoChunks(userIds, USER_IDS_PER_REQUEST);
  const pages = await Promise.all(chunks.map((chunk) => fetchUserRefs(chunk, signal)));
  return pages.flat();
}

export function userListQueryOptions(params: UserListParams) {
  const normalized = normalizeUserListParams(params);
  return queryOptions({
    queryKey: userAdminKeys.list(normalized),
    queryFn: ({ signal }) => fetchUserList(normalized, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export function usersByIdsQueryOptions(userIds: readonly string[]) {
  const ids = toUniqueSorted(userIds);
  return queryOptions({
    queryKey: userAdminKeys.usersByIds(ids),
    queryFn: ({ signal }) => fetchUsersByIds(ids, signal),
  });
}
