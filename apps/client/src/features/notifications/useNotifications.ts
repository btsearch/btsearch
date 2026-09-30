import { type Query, type QueryKey, keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { NotificationsResponse } from "./api";
import { markAllRead as apiMarkAllRead, markRead as apiMarkRead, fetchNotifications } from "./api";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

export const NOTIFICATIONS_PAGE_SIZE = 20;
const NOTIFICATIONS_MAX_LIMIT = 100;

const notificationCaches = {
  predicate: (query: Query) => query.queryKey[0] === "notifications" || query.queryKey[0] === "notifications-badge",
};

type NotificationsSnapshot = { previous: [QueryKey, NotificationsResponse | undefined][] };

export function useNotifications(limit = NOTIFICATIONS_PAGE_SIZE) {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", limit],
    queryFn: () => fetchNotifications({ limit, offset: 0 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
    enabled: !!session?.user,
  });

  const resyncNotifications = () => {
    if (queryClient.isMutating({ mutationKey: ["notifications"] }) !== 1) return;
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-badge"] });
  };

  const applyOptimisticUpdate = async (update: (data: NotificationsResponse) => NotificationsResponse): Promise<NotificationsSnapshot> => {
    await queryClient.cancelQueries(notificationCaches);
    const previous = queryClient.getQueriesData<NotificationsResponse>(notificationCaches);
    queryClient.setQueriesData<NotificationsResponse>(notificationCaches, (old) => (old ? update(old) : old));
    return { previous };
  };

  const rollback = (error: Error, _variables: unknown, context: NotificationsSnapshot | undefined) => {
    context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    showApiError(error);
  };

  const markAllMutation = useMutation({
    mutationKey: ["notifications"],
    mutationFn: apiMarkAllRead,
    onMutate: () => {
      const readAt = new Date().toISOString();
      return applyOptimisticUpdate((old) => ({ ...old, totalUnread: 0, data: old.data.map((n) => ({ ...n, readAt: n.readAt ?? readAt })) }));
    },
    onError: rollback,
    onSettled: resyncNotifications,
  });

  const markReadMutation = useMutation({
    mutationKey: ["notifications"],
    mutationFn: apiMarkRead,
    onMutate: (id: string) => {
      const readAt = new Date().toISOString();
      const wasUnread = queryClient
        .getQueriesData<NotificationsResponse>(notificationCaches)
        .some(([, data]) => data?.data.some((n) => n.id === id && n.readAt === null));
      return applyOptimisticUpdate((old) => ({
        ...old,
        totalUnread: wasUnread ? Math.max(0, old.totalUnread - 1) : old.totalUnread,
        data: old.data.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? readAt } : n)),
      }));
    },
    onError: rollback,
    onSettled: resyncNotifications,
  });

  const notifications = query.data?.data ?? [];
  const totalCount = query.data?.totalCount ?? 0;

  return {
    notifications,
    totalUnread: query.data?.totalUnread ?? 0,
    hasMore: notifications.length < totalCount && limit < NOTIFICATIONS_MAX_LIMIT,
    reachedEnd: notifications.length >= totalCount,
    nextLimit: Math.min(limit + NOTIFICATIONS_PAGE_SIZE, NOTIFICATIONS_MAX_LIMIT),
    isLoading: query.isLoading,
    isLoadingMore: query.isPlaceholderData,
    isLoadingError: query.isLoadingError,
    refetch: query.refetch,
    markAllRead: () => markAllMutation.mutate(),
    markRead: (id: string) => markReadMutation.mutate(id),
  };
}
