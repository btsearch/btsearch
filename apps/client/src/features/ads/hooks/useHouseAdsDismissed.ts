import { useSyncExternalStore } from "react";

const DISMISSED_UNTIL_KEY = "openbts:house-ads-dismissed-until";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();
let dismissed: boolean | undefined;

function readDismissed(): boolean {
  try {
    return Number(localStorage.getItem(DISMISSED_UNTIL_KEY)) > Date.now();
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getDismissed(): boolean {
  dismissed ??= readDismissed();
  return dismissed;
}

function getServerDismissed(): boolean {
  return false;
}

export function useHouseAdsDismissed(): boolean {
  return useSyncExternalStore(subscribe, getDismissed, getServerDismissed);
}

export function dismissHouseAds() {
  dismissed = true;
  for (const listener of listeners) listener();
  try {
    localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_DURATION_MS));
  } catch {}
}
