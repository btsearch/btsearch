import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope & typeof globalThis;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//, /^\/uploads\//, /^\/kmz/, /^\/szukaj\.php(?:\?|$)/] }),
);

const RUNTIME_ASSET_CACHE = "assets-runtime-v1";
const RUNTIME_ASSET_CACHE_MAX_ENTRIES = 200;
const runtimeAssetCache = caches.open(RUNTIME_ASSET_CACHE);

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/assets/"),
  async ({ request }) => {
    const cache = await runtimeAssetCache;
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) void cache.put(request, response.clone());
    return response;
  },
);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    runtimeAssetCache.then(async (cache) => {
      const keys = await cache.keys();
      const excess = keys.length - RUNTIME_ASSET_CACHE_MAX_ENTRIES;
      if (excess > 0) await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting().then(() => self.clients.claim()));
  }
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
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          await existing.focus();
          try {
            await existing.navigate(url);
          } catch {
            await self.clients.openWindow(url);
          }
          return;
        }

        await self.clients.openWindow(url);
      }),
    ]),
  );
});
