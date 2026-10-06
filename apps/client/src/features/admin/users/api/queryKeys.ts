import type { QueryClient } from "@tanstack/react-query";

import type { UserListParams } from "../types";
import { USER_PROFILE_QUERY_KEY } from "@/features/user-profile/queries";

const USER_ADMIN_ROOT = ["admin", "users"] as const;

export const userAdminKeys = {
  lists: () => [...USER_ADMIN_ROOT, "list"] as const,
  list: (params: UserListParams) => [...USER_ADMIN_ROOT, "list", "page", params] as const,
  usersByIds: (userIds: readonly string[]) => [...USER_ADMIN_ROOT, "list", "by-ids", userIds] as const,
  pickers: () => [...USER_ADMIN_ROOT, "picker"] as const,
  grants: () => [...USER_ADMIN_ROOT, "grants"] as const,
  grantsOfUsers: (userIds: readonly string[]) => [...USER_ADMIN_ROOT, "grants", userIds] as const,
  user: (userId: string) => [...USER_ADMIN_ROOT, "detail", userId] as const,
  account: (userId: string) => [...USER_ADMIN_ROOT, "detail", userId, "account"] as const,
  sessions: (userId: string) => [...USER_ADMIN_ROOT, "detail", userId, "sessions"] as const,
  hasPassword: (userId: string) => [...USER_ADMIN_ROOT, "detail", userId, "has-password"] as const,
  activity: (userId: string) => [...USER_ADMIN_ROOT, "detail", userId, "activity"] as const,
  accountHistory: (userId: string) => [...USER_ADMIN_ROOT, "detail", userId, "history"] as const,
  profileVisibility: (userId: string, username: string | null) => [...USER_ADMIN_ROOT, "detail", userId, "profile-visibility", username] as const,
  countryRegions: (countryCodes: readonly string[]) => [...USER_ADMIN_ROOT, "reference", "regions", countryCodes] as const,
};

async function invalidateUserAdminLists(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: userAdminKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: userAdminKeys.pickers() }),
    queryClient.invalidateQueries({ queryKey: userAdminKeys.grants() }),
  ]);
}

export async function invalidateUserAdminQueries(queryClient: QueryClient, userId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: userAdminKeys.user(userId) }),
    queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY }),
    invalidateUserAdminLists(queryClient),
  ]);
}

export async function discardRemovedUserQueries(queryClient: QueryClient, userId: string): Promise<void> {
  queryClient.removeQueries({ queryKey: userAdminKeys.user(userId) });
  await Promise.all([queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY }), invalidateUserAdminLists(queryClient)]);
}
