import type { Notification, NotificationList } from "@openbts/shared/contract";
import { type QueryClient, type QueryKey, keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchNotificationList, markAllNotificationsRead, markNotificationRead, notificationKeys, unreadNotificationCountQueryOptions } from "./api";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

export const NOTIFICATIONS_PAGE_SIZE = 20;
const NOTIFICATIONS_MAX_LIMIT = 100;
const MARK_ONE_READ_KEY = [...notificationKeys.all, "mark-one-read"] as const;
const MARK_ALL_READ_KEY = [...notificationKeys.all, "mark-all-read"] as const;

type NotificationCachesSnapshot = {
  lists: [QueryKey, NotificationList | undefined][];
  unreadCount: number | undefined;
};

function toReadNotification(notification: Notification, readAt: string): Notification {
  return notification.isRead ? notification : { ...notification, isRead: true, readAt };
}

function toUnreadNotification(notification: Notification): Notification {
  return { ...notification, isRead: false, readAt: null };
}

function keepPendingReadMarks(client: QueryClient, list: NotificationList): NotificationList {
  const isMarkingAll = client.isMutating({ mutationKey: MARK_ALL_READ_KEY }) > 0;
  const pendingMarks = client.getMutationCache().findAll({ mutationKey: MARK_ONE_READ_KEY, status: "pending" });
  if (!isMarkingAll && pendingMarks.length === 0) return list;

  const readAt = new Date().toISOString();
  const markedIds = new Set(pendingMarks.map((mutation) => mutation.state.variables));
  const isMarked = (notification: Notification) => isMarkingAll || markedIds.has(notification.id);
  const data = list.data.map((notification) => (isMarked(notification) ? toReadNotification(notification, readAt) : notification));
  return { ...list, data };
}

export function useNotifications(limit: number) {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const isSignedIn = !!session?.user;

  const listQuery = useQuery({
    queryKey: notificationKeys.list(limit),
    queryFn: async ({ client, signal }) => keepPendingReadMarks(client, await fetchNotificationList(limit, signal)),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
    enabled: isSignedIn,
  });
  const unreadCountQuery = useQuery({ ...unreadNotificationCountQueryOptions(), enabled: isSignedIn });

  const resyncNotifications = async () => {
    await queryClient.cancelQueries({ queryKey: notificationKeys.all });
    const isLastPendingMark = queryClient.isMutating({ mutationKey: notificationKeys.all }) === 1;
    if (isLastPendingMark) void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };

  const snapshotCaches = async (): Promise<NotificationCachesSnapshot> => {
    await queryClient.cancelQueries({ queryKey: notificationKeys.all });
    return {
      lists: queryClient.getQueriesData<NotificationList>({ queryKey: notificationKeys.lists }),
      unreadCount: queryClient.getQueryData<number>(notificationKeys.unreadCount),
    };
  };

  const updateCachedLists = (update: (notification: Notification) => Notification) => {
    queryClient.setQueriesData<NotificationList>({ queryKey: notificationKeys.lists }, (list) =>
      list === undefined ? list : { ...list, data: list.data.map(update) },
    );
  };

  const updateCachedUnreadCount = (update: (count: number) => number) => {
    queryClient.setQueryData<number>(notificationKeys.unreadCount, (count) => (count === undefined ? count : update(count)));
  };

  const rollback = (error: Error, _variables: unknown, snapshot: NotificationCachesSnapshot | undefined) => {
    if (snapshot !== undefined) {
      snapshot.lists.forEach(([queryKey, list]) => queryClient.setQueryData(queryKey, list));
      queryClient.setQueryData(notificationKeys.unreadCount, snapshot.unreadCount);
    }
    showApiError(error);
  };

  const markAllMutation = useMutation({
    mutationKey: MARK_ALL_READ_KEY,
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      const snapshot = await snapshotCaches();
      const readAt = new Date().toISOString();
      updateCachedLists((notification) => toReadNotification(notification, readAt));
      updateCachedUnreadCount(() => 0);
      return snapshot;
    },
    onError: rollback,
    onSettled: resyncNotifications,
  });

  const markReadMutation = useMutation({
    mutationKey: MARK_ONE_READ_KEY,
    mutationFn: markNotificationRead,
    onMutate: async (id: string) => {
      const snapshot = await snapshotCaches();
      const readAt = new Date().toISOString();
      const wasUnread = snapshot.lists.some(([, list]) => list?.data.some((notification) => notification.id === id && !notification.isRead));
      updateCachedLists((notification) => (notification.id === id ? toReadNotification(notification, readAt) : notification));
      if (wasUnread) updateCachedUnreadCount((count) => Math.max(0, count - 1));
      return wasUnread;
    },
    onError: (error, id, wasUnread) => {
      const isMarkingAll = queryClient.isMutating({ mutationKey: MARK_ALL_READ_KEY }) > 0;
      if (wasUnread && !isMarkingAll) {
        updateCachedLists((notification) => (notification.id === id ? toUnreadNotification(notification) : notification));
        updateCachedUnreadCount((count) => count + 1);
      }
      showApiError(error);
    },
    onSettled: resyncNotifications,
  });

  const notifications = listQuery.data?.data ?? [];
  const hasNextPage = listQuery.data !== undefined && listQuery.data.paging.nextCursor !== null;

  return {
    notifications,
    unreadCount: unreadCountQuery.data ?? 0,
    hasMore: hasNextPage && limit < NOTIFICATIONS_MAX_LIMIT,
    reachedEnd: !hasNextPage,
    nextLimit: Math.min(limit + NOTIFICATIONS_PAGE_SIZE, NOTIFICATIONS_MAX_LIMIT),
    isLoading: listQuery.isLoading,
    isLoadingMore: listQuery.isPlaceholderData,
    isLoadingError: listQuery.isLoadingError,
    refetch: listQuery.refetch,
    markAllRead: () => markAllMutation.mutate(),
    markRead: (id: string) => markReadMutation.mutate(id),
  };
}
