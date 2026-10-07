import type { RoleGrantList } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import type { RoleGrant, RoleGrantCreate } from "../types";
import { toUniqueSorted } from "../utils/ids";
import { userAdminKeys } from "./queryKeys";
import { API_V2_BASE, JSON_HEADERS, fetchJson, fetchV2Data } from "@/lib/api";
import { splitIntoChunks } from "@/lib/splitIntoChunks";

const USER_IDS_PER_REQUEST = 100;
const GRANTS_PER_PAGE = 200;

async function fetchGrantsFrom(cursor: string | null, userIds: readonly string[], signal?: AbortSignal): Promise<RoleGrant[]> {
  const query = new URLSearchParams({ userIds: userIds.join(","), limit: String(GRANTS_PER_PAGE) });
  if (cursor !== null) query.set("cursor", cursor);
  const page = await fetchJson<RoleGrantList>(`${API_V2_BASE}/role-grants?${query.toString()}`, { signal });
  const nextCursor = page.paging.nextCursor;
  if (nextCursor === null) return page.data;
  return [...page.data, ...(await fetchGrantsFrom(nextCursor, userIds, signal))];
}

function fetchGrantsOfUsers(userIds: readonly string[], signal?: AbortSignal): Promise<RoleGrant[]> {
  return fetchGrantsFrom(null, userIds, signal);
}

async function fetchRoleGrants(userIds: readonly string[], signal?: AbortSignal): Promise<RoleGrant[]> {
  const chunks = splitIntoChunks(userIds, USER_IDS_PER_REQUEST);
  const pages = await Promise.all(chunks.map((chunk) => fetchGrantsOfUsers(chunk, signal)));
  return pages.flat();
}

export function createRoleGrant(grant: RoleGrantCreate): Promise<RoleGrant> {
  const body: RoleGrantCreate = {
    userId: grant.userId,
    role: grant.role,
    countryCode: grant.countryCode,
    regionIds: grant.role === "maintainer" ? null : grant.regionIds,
  };
  return fetchV2Data<RoleGrant>("role-grants", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export function updateRoleGrantRegions(grantId: string, regionIds: number[] | null): Promise<RoleGrant> {
  return fetchV2Data<RoleGrant>(`role-grants/${encodeURIComponent(grantId)}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ regionIds }),
  });
}

export async function deleteRoleGrant(grantId: string): Promise<void> {
  await fetchJson<void>(`${API_V2_BASE}/role-grants/${encodeURIComponent(grantId)}`, { method: "DELETE" });
}

export function roleGrantsQueryOptions(userIds: readonly string[]) {
  const ids = toUniqueSorted(userIds);
  return queryOptions({
    queryKey: userAdminKeys.grantsOfUsers(ids),
    queryFn: ({ signal }) => fetchRoleGrants(ids, signal),
    staleTime: 0,
  });
}

export function userGrantsQueryOptions(userId: string) {
  return roleGrantsQueryOptions([userId]);
}
