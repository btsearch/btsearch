import type { RoleGrantList } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import type { TeamGrant } from "../types";
import { referenceKeys } from "./queryKeys";
import { toUniqueSorted } from "@/features/admin/users/utils/ids";
import { API_V2_BASE, fetchJson } from "@/lib/api";
import { splitIntoChunks } from "@/lib/splitIntoChunks";

const COUNTRY_CODES_PER_REQUEST = 100;
const GRANTS_PER_PAGE = 200;

async function fetchTeamGrantsFrom(cursor: string | null, countryCodes: readonly string[], signal?: AbortSignal): Promise<TeamGrant[]> {
  const query = new URLSearchParams({ countryCodes: countryCodes.join(","), include: "user", limit: String(GRANTS_PER_PAGE) });
  if (cursor !== null) query.set("cursor", cursor);
  const page = await fetchJson<RoleGrantList>(`${API_V2_BASE}/role-grants?${query.toString()}`, { signal });
  const grants: TeamGrant[] = page.data.map((grant) => ({ ...grant, user: grant.user ?? null }));
  const nextCursor = page.paging.nextCursor;
  if (nextCursor === null) return grants;
  return [...grants, ...(await fetchTeamGrantsFrom(nextCursor, countryCodes, signal))];
}

function fetchTeamGrantsOfCountries(countryCodes: readonly string[], signal?: AbortSignal): Promise<TeamGrant[]> {
  return fetchTeamGrantsFrom(null, countryCodes, signal);
}

async function fetchTeamGrants(countryCodes: readonly string[], signal?: AbortSignal): Promise<TeamGrant[]> {
  const chunks = splitIntoChunks(countryCodes, COUNTRY_CODES_PER_REQUEST);
  const pages = await Promise.all(chunks.map((chunk) => fetchTeamGrantsOfCountries(chunk, signal)));
  return pages.flat();
}

export function teamGrantsQueryOptions(countryCodes: readonly string[]) {
  const codes = toUniqueSorted(countryCodes);
  return queryOptions({
    queryKey: referenceKeys.teamGrants(codes),
    queryFn: ({ signal }) => fetchTeamGrants(codes, signal),
    staleTime: 0,
  });
}
