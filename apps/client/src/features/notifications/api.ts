import type {
  NotificationList,
  PushSubscriptionCreate,
  PushSubscription as PushSubscriptionRecord,
  PushSubscriptionUpdate,
  PushTopics,
  UnreadNotifications,
} from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import { API_V2_BASE, JSON_HEADERS, fetchJson, fetchV2Data } from "@/lib/api";

const NOTIFICATIONS_KEY = ["notifications", "v2"] as const;

export const notificationKeys = {
  all: NOTIFICATIONS_KEY,
  lists: [...NOTIFICATIONS_KEY, "list"] as const,
  list: (limit: number) => [...NOTIFICATIONS_KEY, "list", limit] as const,
  unreadCount: [...NOTIFICATIONS_KEY, "unread-count"] as const,
};

export const pushSubscriptionKeys = {
  topics: (subscriptionId: string | null) => ["push-subscription", "v2", subscriptionId, "topics"] as const,
};

export function fetchNotificationList(limit: number, signal?: AbortSignal): Promise<NotificationList> {
  return fetchJson<NotificationList>(`${API_V2_BASE}/notifications?limit=${limit}`, { signal });
}

async function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const unread = await fetchV2Data<UnreadNotifications>("notifications/unread-count", { signal });
  return unread.count;
}

export function unreadNotificationCountQueryOptions() {
  return queryOptions({
    queryKey: notificationKeys.unreadCount,
    queryFn: async ({ client, signal }) => {
      const count = await fetchUnreadNotificationCount(signal);
      const isReadMarkPending = client.isMutating({ mutationKey: notificationKeys.all }) > 0;
      return isReadMarkPending ? (client.getQueryData<number>(notificationKeys.unreadCount) ?? count) : count;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetchJson(`${API_V2_BASE}/notifications/${id}/read`, { method: "PUT" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetchJson(`${API_V2_BASE}/notifications/read`, { method: "PUT" });
}

export async function registerPushSubscription(browserSubscription: PushSubscription): Promise<PushSubscriptionRecord> {
  const { keys } = browserSubscription.toJSON();
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (!p256dh || !auth) throw new Error("Browser did not return push subscription keys");

  const registration: PushSubscriptionCreate = { endpoint: browserSubscription.endpoint, keys: { p256dh, auth } };
  return fetchV2Data<PushSubscriptionRecord>("push-subscriptions", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(registration) });
}

export function fetchPushSubscription(id: string, signal?: AbortSignal): Promise<PushSubscriptionRecord> {
  return fetchV2Data<PushSubscriptionRecord>(`push-subscriptions/${id}`, { signal });
}

export function updatePushTopics(id: string, topics: Partial<PushTopics>): Promise<PushSubscriptionRecord> {
  const change: PushSubscriptionUpdate = { topics };
  return fetchV2Data<PushSubscriptionRecord>(`push-subscriptions/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(change) });
}

export async function deletePushSubscription(id: string): Promise<void> {
  await fetchJson(`${API_V2_BASE}/push-subscriptions/${id}`, { method: "DELETE" });
}
