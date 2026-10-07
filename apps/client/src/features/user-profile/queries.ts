import type { CommentList, UserContact, UserProfile } from "@openbts/shared/contract";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { API_V2_BASE, ApiResponseError, fetchJson, fetchV2Data } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export type { UserProfile };
export type ContactDetails = UserContact;

export const USER_PROFILE_QUERY_KEY = ["user-profile"] as const;
export const PROFILE_COMMENT_PAGE_SIZE = 20;

export function userProfileQueryPrefix(username: string) {
  return [...USER_PROFILE_QUERY_KEY, username.toLowerCase()] as const;
}

export function userProfileQueryOptions(username: string, viewerId: string | null) {
  return queryOptions({
    queryKey: [...userProfileQueryPrefix(username), "v2", viewerId] as const,
    queryFn: ({ signal }) => fetchV2Data<UserProfile>(`users/${encodeURIComponent(username)}`, { signal, cache: "no-store" }),
    retry: false,
  });
}

export function isUserCommentsUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiResponseError &&
    (error.status === 404 || (error.status === 403 && error.errors.some((entry) => entry.code === "FEATURE_DISABLED")))
  );
}

export function userCommentsQueryOptions(username: string, viewerId: string | null, operatorId: number | null) {
  return infiniteQueryOptions({
    queryKey: [...userProfileQueryPrefix(username), "v2", viewerId, "comments", operatorId] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ include: "station.location", sort: "-createdAt", limit: String(PROFILE_COMMENT_PAGE_SIZE) });
      if (operatorId !== null) params.set("operatorIds", String(operatorId));
      if (pageParam !== null) params.set("cursor", pageParam);
      else params.set("includeTotal", "true");
      try {
        return await fetchJson<CommentList>(`${API_V2_BASE}/users/${encodeURIComponent(username)}/comments?${params}`, { signal, cache: "no-store" });
      } catch (error) {
        if (isUserCommentsUnavailable(error))
          void queryClient.invalidateQueries({ queryKey: userProfileQueryOptions(username, viewerId).queryKey, exact: true });
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage.paging.nextCursor,
    retry: false,
  });
}
