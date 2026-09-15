import { API_BASE, fetchApiData, fetchJson, postApiData } from "@/lib/api";

export type Notification = {
  id: string;
  userId: string;
  type:
    | "submission_approved"
    | "submission_rejected"
    | "submission_photo_upload_failed"
    | "new_submission"
    | "station_cells_changed"
    | "station_photos_added"
    | "station_comment_approved"
    | "station_uke_permit_added";
  title: string;
  submissionId: string | null;
  stationId: number | null;
  ukeStationId: number | null;
  metadata: Record<string, unknown> | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationsResponse = {
  data: Notification[];
  totalUnread: number;
  total: number;
};

export async function fetchNotifications(params?: { limit?: number; offset?: number }): Promise<NotificationsResponse> {
  const qs = new URLSearchParams();
  if (params?.limit !== null && params?.limit !== undefined) qs.set("limit", String(params.limit));
  if (params?.offset !== null && params?.offset !== undefined) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return fetchJson<NotificationsResponse>(`${API_BASE}/notifications${query ? `?${query}` : ""}`);
}

export async function markAllRead(): Promise<{ updated: number }> {
  return fetchJson<{ updated: number }>(`${API_BASE}/notifications/read-all`, { method: "PUT" });
}

export async function markRead(id: string): Promise<Notification> {
  return fetchApiData<Notification>(`notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function subscribeToPush(sub: PushSubscription): Promise<string> {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("Browser did not return push subscription keys");

  const { id } = await postApiData<{ id: string }>("push/subscribe", {
    endpoint: sub.endpoint,
    keys: { p256dh, auth },
  });
  return id;
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  await fetchJson(`${API_BASE}/push/subscribe`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export type PushPreferences = {
  ukeUpdates: boolean;
  submissionUpdates: boolean;
  newSubmission: boolean;
  stationWatches: boolean;
};

export async function fetchPushPreferences(id: string): Promise<PushPreferences> {
  return fetchApiData<PushPreferences>(`push/preferences?id=${encodeURIComponent(id)}`);
}

export async function updatePushPreferences(prefs: Partial<PushPreferences>, id: string): Promise<void> {
  await fetchJson(`${API_BASE}/push/subscribe`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...prefs, id }),
  });
}
