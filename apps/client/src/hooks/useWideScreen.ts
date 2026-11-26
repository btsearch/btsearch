import { useSyncExternalStore } from "react";

const WIDE_SCREEN_MEDIA_QUERY = "(min-width: 1280px)";

let wideScreenMediaQuery: MediaQueryList | undefined;

function getWideScreenMediaQuery(): MediaQueryList | undefined {
  if (typeof window === "undefined") return undefined;
  wideScreenMediaQuery ??= window.matchMedia(WIDE_SCREEN_MEDIA_QUERY);
  return wideScreenMediaQuery;
}

function subscribe(callback: () => void): () => void {
  const mediaQuery = getWideScreenMediaQuery();
  if (mediaQuery === undefined) return () => {};
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return getWideScreenMediaQuery()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsWideScreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
