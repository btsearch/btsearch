import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { subscribeToPush, unsubscribeFromPush } from "./api";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const STORAGE_KEY = "push_subscription_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVICE_WORKER_URL = "/sw.js";

function getStoredId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && UUID_RE.test(v)) return v;
    if (v) localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function setStoredId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}

function removeStoredId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function isPushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);

  return outputArray;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;

  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
  return navigator.serviceWorker.ready;
}

export function usePushSubscription() {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(getStoredId);
  const [permission, setPermission] = useState<NotificationPermission>(() => (isPushSupported() ? Notification.permission : "default"));
  const [isSubscribing, setIsSubscribing] = useState(false);
  const syncing = useRef(false);
  const subscriptionRef = useRef(subscription);

  useEffect(() => {
    subscriptionRef.current = subscription;
  }, [subscription]);

  useEffect(() => {
    if (!isPushSupported()) return;

    let cancelled = false;
    getPushRegistration()
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        if (cancelled) return;
        setSubscription(sub);
        if (sub && !getStoredId() && !syncing.current) {
          syncing.current = true;
          try {
            const id = await subscribeToPush(sub);
            if (cancelled) return;
            setStoredId(id);
            setSubscriptionId(id);
          } finally {
            syncing.current = false;
          }
        }
      })
      .catch(() => {
        syncing.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!isPushSupported()) {
      toast.error("Push notifications are not supported by this browser");
      return;
    }

    setIsSubscribing(true);
    try {
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        toast.error("Notification permission denied");
        return;
      }

      if (!VAPID_PUBLIC_KEY) {
        toast.error("Push notifications are not configured in this client build");
        return;
      }

      const reg = await getPushRegistration();
      const existing = await reg.pushManager.getSubscription();

      let sub = existing;
      if (existing) {
        const existingKey = existing.options.applicationServerKey;
        if (existingKey) {
          const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
          const existingKeyBytes = new Uint8Array(existingKey);
          const keyMatches = currentKey.length === existingKeyBytes.length && currentKey.every((b, i) => b === existingKeyBytes[i]);
          if (!keyMatches) {
            await existing.unsubscribe();
            sub = null;
          }
        }
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const id = await subscribeToPush(sub);
      setStoredId(id);
      setSubscription(sub);
      setSubscriptionId(id);
      toast.success("Push notifications enabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to enable notifications");
    } finally {
      setIsSubscribing(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    const sub = subscriptionRef.current;
    if (!sub) return;
    try {
      await unsubscribeFromPush(sub.endpoint);
      await sub.unsubscribe();
      removeStoredId();
      setSubscription(null);
      setSubscriptionId(null);
    } catch {
      toast.error("Failed to disable notifications");
    }
  }, []);

  const isSupported = isPushSupported();

  return { subscription, subscriptionId, permission, isSubscribing, subscribe, unsubscribe, isSupported };
}
