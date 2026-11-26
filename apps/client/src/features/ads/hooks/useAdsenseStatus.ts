import { useSyncExternalStore } from "react";

declare global {
  interface Window {
    __adsenseClient?: string;
  }
}

export type AdsenseStatus = "pending" | "ready" | "blocked";

const AD_FRAME_PROBE_URL = "https://googleads.g.doubleclick.net/pagead/ads";
const AD_FRAME_PROBE_TIMEOUT_MS = 5000;

let scriptRequested = false;
let adsenseStatus: AdsenseStatus = "pending";
const listeners = new Set<() => void>();

function setAdsenseStatus(status: AdsenseStatus) {
  adsenseStatus = status;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getAdsenseStatus(): AdsenseStatus {
  return adsenseStatus;
}

function getServerAdsenseStatus(): AdsenseStatus {
  return "pending";
}

export function useAdsenseStatus(): AdsenseStatus {
  return useSyncExternalStore(subscribe, getAdsenseStatus, getServerAdsenseStatus);
}

function probeAdFrame(): Promise<boolean> {
  return fetch(AD_FRAME_PROBE_URL, {
    method: "HEAD",
    mode: "no-cors",
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(AD_FRAME_PROBE_TIMEOUT_MS),
  }).then(
    () => true,
    (error: unknown) => error instanceof DOMException && error.name === "TimeoutError",
  );
}

export function loadAdsenseScript() {
  if (scriptRequested) return;
  const client = window.__adsenseClient;
  if (!client) return;
  scriptRequested = true;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  script.onload = () => void probeAdFrame().then((reachable) => setAdsenseStatus(reachable ? "ready" : "blocked"));
  script.onerror = () => setAdsenseStatus("blocked");
  document.head.appendChild(script);
}
