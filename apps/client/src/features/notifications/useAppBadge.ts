import type { SubmissionList } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { unreadNotificationCountQueryOptions } from "./api";
import { API_V2_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

const PENDING_SUBMISSIONS_PATH = "submissions?submitters=all&statuses=pending&limit=1&includeTotal=true";

async function fetchPendingSubmissionCount(signal?: AbortSignal): Promise<number> {
  const page = await fetchJson<Pick<SubmissionList, "paging">>(`${API_V2_BASE}/${PENDING_SUBMISSIONS_PATH}`, { signal });
  return page.paging.total ?? 0;
}

export function useAppBadge() {
  const { data: session } = authClient.useSession();
  const isSignedIn = !!session?.user;
  const isAdmin = session?.user?.role === "admin";

  const pendingQuery = useQuery({
    queryKey: ["pending-submissions-count", "v2"],
    queryFn: ({ signal }) => fetchPendingSubmissionCount(signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: isAdmin,
  });

  const unreadCountQuery = useQuery({ ...unreadNotificationCountQueryOptions(), enabled: isSignedIn && !isAdmin });

  const badgeCount = isAdmin ? (pendingQuery.data ?? 0) : (unreadCountQuery.data ?? 0);
  const dataUpdatedAt = isAdmin ? pendingQuery.dataUpdatedAt : unreadCountQuery.dataUpdatedAt;

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (badgeCount > 0) void navigator.setAppBadge(badgeCount);
    else void navigator.clearAppBadge();
  }, [badgeCount, dataUpdatedAt]);

  useEffect(() => {
    if (!isSignedIn && "clearAppBadge" in navigator) void navigator.clearAppBadge();
  }, [isSignedIn]);
}
