import { queryOptions } from "@tanstack/react-query";

import { API_BASE, fetchJson } from "@/lib/api";

export type ProfileUser = {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
  bio: string | null;
  role: string | null;
  createdAt: string;
};

export type ContactDetails = {
  instagram: string | null;
  facebook: string | null;
  email: string | null;
};

export type ProfileComment = {
  id: string;
  content: string;
  createdAt: string;
  station: {
    id: number;
    station_id: string | null;
    city: string | null;
    operator: { id: number; name: string; mnc: number | null } | null;
  };
};

export type UserProfile = {
  user: ProfileUser;
  visibility: "public" | "private";
  restricted: boolean;
  contact: ContactDetails | null;
  contactHidden: boolean;
  hunter: { regions: number[] } | null;
  comments: { totalCount: number; items: ProfileComment[] } | null;
};

export const USER_PROFILE_QUERY_KEY = ["user-profile"] as const;

export function userProfileQueryOptions(username: string) {
  return queryOptions({
    queryKey: [...USER_PROFILE_QUERY_KEY, username.toLowerCase()] as const,
    queryFn: ({ signal }) =>
      fetchJson<{ data: UserProfile }>(`${API_BASE}/users/${encodeURIComponent(username)}`, { signal }).then((response) => response.data),
    retry: false,
  });
}
