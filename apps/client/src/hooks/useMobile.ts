import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

let mobileMediaQuery: MediaQueryList | undefined;

function getMobileMediaQuery() {
  if (typeof window === "undefined") return undefined;
  mobileMediaQuery ??= window.matchMedia(MOBILE_MEDIA_QUERY);
  return mobileMediaQuery;
}

function subscribe(callback: () => void) {
  const mediaQuery = getMobileMediaQuery();
  if (mediaQuery === undefined) return () => {};
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getSnapshot() {
  return getMobileMediaQuery()?.matches ?? false;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
