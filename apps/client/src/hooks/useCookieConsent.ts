import { useCallback, useSyncExternalStore } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    __adsenseClient?: string;
  }
}

export type CookieConsent = "accepted" | "rejected";

const CONSENT_KEY = "openbts:cookie-consent";

let listeners: Array<() => void> = [];
let cachedConsent: CookieConsent | null | undefined = undefined;

function readConsent(): CookieConsent | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "accepted" || stored === "rejected") return stored;
  } catch {
    // ignore
  }
  return null;
}

function getSnapshot(): CookieConsent | null {
  if (cachedConsent === undefined) {
    cachedConsent = readConsent();
  }
  return cachedConsent;
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function updateGtagConsent(granted: boolean) {
  try {
    window.gtag?.("consent", "update", {
      ad_storage: granted ? "granted" : "denied",
      ad_user_data: granted ? "granted" : "denied",
      ad_personalization: granted ? "granted" : "denied",
      analytics_storage: granted ? "granted" : "denied",
    });
  } catch {
    // ignore
  }
}

let adsenseScriptLoaded = false;

export function loadAdsenseScript() {
  if (adsenseScriptLoaded) return;
  const client = window.__adsenseClient;
  if (!client) return;
  adsenseScriptLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  document.head.appendChild(s);
}

function writeConsent(value: CookieConsent | null) {
  cachedConsent = value;
  try {
    if (value === null) {
      localStorage.removeItem(CONSENT_KEY);
    } else {
      localStorage.setItem(CONSENT_KEY, value);
    }
  } catch {
    // ignore
  }
  updateGtagConsent(value === "accepted");
  for (const listener of listeners) listener();
}

export function getCookieConsent(): CookieConsent | null {
  return readConsent();
}

export function useCookieConsent() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const accept = useCallback(() => writeConsent("accepted"), []);
  const reject = useCallback(() => writeConsent("rejected"), []);
  const reset = useCallback(() => writeConsent(null), []);

  return { consent, accept, reject, reset };
}
