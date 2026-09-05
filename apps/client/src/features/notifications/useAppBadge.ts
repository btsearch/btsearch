import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

import { fetchNotifications } from "./api";

const PRIVILEGED_ROLES = new Set(["admin"]);

async function fetchPendingSubmissionsCount(): Promise<number> {
  const result = await fetchJson<{ totalCount: number }>(`${API_BASE}/submissions?status=pending&limit=1&offset=0`);
  return result.totalCount ?? 0;
}

export function useAppBadge() {
  const { data: session } = authClient.useSession();
  const role = (session?.user?.role as string | undefined) ?? "user";
  const isPrivileged = PRIVILEGED_ROLES.has(role);

  const pendingQuery = useQuery({
    queryKey: ["pending-submissions-count"],
    queryFn: fetchPendingSubmissionsCount,
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: !!session?.user && isPrivileged,
  });

  const notificationsQuery = useQuery({
    queryKey: ["notifications-badge"],
    queryFn: () => fetchNotifications({ limit: 1, offset: 0 }),
    refetchInterval: 30_000,
    staleTime: 10_000,
    enabled: !!session?.user && !isPrivileged,
  });

  const badgeCount = isPrivileged ? (pendingQuery.data ?? 0) : (notificationsQuery.data?.totalUnread ?? 0);
  const dataUpdatedAt = isPrivileged ? pendingQuery.dataUpdatedAt : notificationsQuery.dataUpdatedAt;

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (badgeCount > 0) {
      void navigator.setAppBadge(badgeCount);
    } else {
      void navigator.clearAppBadge();
    }
  }, [badgeCount, dataUpdatedAt]);

  useEffect(() => {
    if (!session?.user && "clearAppBadge" in navigator) {
      void navigator.clearAppBadge();
    }
  }, [session?.user]);
}
