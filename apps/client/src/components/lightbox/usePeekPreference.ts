import { useSyncExternalStore } from "react";

const STORAGE_KEY = "lightbox:peek";
const listeners = new Set<() => void>();
let snapshot: boolean | null = null;

function readStoredValue() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeStoredValue(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    return;
  }
}

function getSnapshot() {
  snapshot ??= readStoredValue();
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPeekPreference(value: boolean) {
  snapshot = value;
  writeStoredValue(value);
  for (const listener of listeners) listener();
}

export function usePeekPreference() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
