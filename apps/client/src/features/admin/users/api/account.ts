import { queryOptions } from "@tanstack/react-query";

import { USER_DETAIL_PRELOAD_STALE_TIME } from "../constants";
import { userAdminKeys } from "./queryKeys";
import { API_BASE, fetchJson } from "@/lib/api";

async function fetchHasPassword(userId: string, signal?: AbortSignal): Promise<boolean> {
  const query = new URLSearchParams({ userId });
  const response = await fetchJson<{ data: { hasPassword: boolean } }>(`${API_BASE}/account/password?${query.toString()}`, { signal });
  return response.data.hasPassword;
}

export async function resendVerificationEmail(userId: string): Promise<void> {
  await fetchJson<{ data: null }>(`${API_BASE}/admin/users/${encodeURIComponent(userId)}/resend-verification`, { method: "POST" });
}

export async function deleteAvatarFile(userId: string): Promise<void> {
  await fetchJson<{ data: null }>(`${API_BASE}/users/${encodeURIComponent(userId)}/avatar`, { method: "DELETE" });
}

export function hasPasswordQueryOptions(userId: string) {
  return queryOptions({
    queryKey: userAdminKeys.hasPassword(userId),
    queryFn: ({ signal }) => fetchHasPassword(userId, signal),
    staleTime: USER_DETAIL_PRELOAD_STALE_TIME,
  });
}
