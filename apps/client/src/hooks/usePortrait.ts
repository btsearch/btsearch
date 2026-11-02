import { useSyncExternalStore } from "react";

const PORTRAIT_MEDIA_QUERY = "(orientation: portrait)";

let portraitMediaQuery: MediaQueryList | undefined;

function getPortraitMediaQuery(): MediaQueryList | undefined {
  if (typeof window === "undefined") return undefined;
  portraitMediaQuery ??= window.matchMedia(PORTRAIT_MEDIA_QUERY);
  return portraitMediaQuery;
}

function subscribe(callback: () => void): () => void {
  const mediaQuery = getPortraitMediaQuery();
  if (mediaQuery === undefined) return () => {};
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return getPortraitMediaQuery()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsPortrait(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
