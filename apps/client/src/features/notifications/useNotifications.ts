import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";

import type { NotificationsResponse } from "./api";
import { markAllRead as apiMarkAllRead, markRead as apiMarkRead, fetchNotifications } from "./api";

export function useNotifications() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications({ limit: 20, offset: 0 }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
    enabled: !!session?.user,
  });

  const markAllMutation = useMutation({
    mutationFn: apiMarkAllRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = queryClient.getQueryData<NotificationsResponse>(["notifications"]);
      queryClient.setQueryData<NotificationsResponse>(["notifications"], (old) => {
        if (!old) return old;
        return {
          ...old,
          totalUnread: 0,
          data: old.data.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["notifications"], context.previous);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications-badge"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: apiMarkRead,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = queryClient.getQueryData<NotificationsResponse>(["notifications"]);
      queryClient.setQueryData<NotificationsResponse>(["notifications"], (old) => {
        if (!old) return old;
        const wasUnread = old.data.some((n) => n.id === id && !n.readAt);
        return {
          ...old,
          totalUnread: wasUnread ? Math.max(0, old.totalUnread - 1) : old.totalUnread,
          data: old.data.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["notifications"], context.previous);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications-badge"] });
    },
  });

  return {
    notifications: query.data?.data ?? [],
    totalUnread: query.data?.totalUnread ?? 0,
    isLoading: query.isLoading,
    markAllRead: () => markAllMutation.mutate(),
    markRead: (id: string) => markReadMutation.mutate(id),
  };
}
