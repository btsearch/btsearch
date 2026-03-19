import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope & typeof globalThis;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//, /^\/uploads\//] }));

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

type PushPayload = {
  title?: string;
  body?: string;
  actionUrl?: string;
  notificationId?: string;
};

self.addEventListener("push", (event) => {
  let data: PushPayload = {};
  try {
    data = ((event as PushEvent).data?.json() as PushPayload) ?? {};
  } catch {
    data = { title: (event as PushEvent).data?.text() ?? "BTSearch" };
  }

  (event as ExtendableEvent).waitUntil(
    self.registration.showNotification(data.title ?? "BTSearch", {
      body: data.body || undefined,
      icon: "/pwa-192x192.png",
      data: { actionUrl: data.actionUrl, notificationId: data.notificationId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const evt = event as NotificationEvent;
  evt.notification.close();
  const data = evt.notification.data as { actionUrl?: string; notificationId?: string };
  const url: string = data?.actionUrl ?? "/";
  const notificationId: string | undefined = data?.notificationId;

  evt.waitUntil(
    Promise.all([
      notificationId
        ? fetch(`/api/v1/notifications/${notificationId}/read`, { method: "PATCH", credentials: "include" }).catch(() => {})
        : Promise.resolve(),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) return existing.focus().then(() => existing.navigate(url));
        return self.clients.openWindow(url);
      }),
    ]),
  );
});
