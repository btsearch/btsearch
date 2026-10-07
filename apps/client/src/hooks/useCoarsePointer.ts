import { useSyncExternalStore } from "react";

const COARSE_POINTER_MEDIA_QUERY = "(pointer: coarse)";

let coarsePointerMediaQuery: MediaQueryList | undefined;

function getCoarsePointerMediaQuery(): MediaQueryList | undefined {
  if (typeof window === "undefined") return undefined;
  coarsePointerMediaQuery ??= window.matchMedia(COARSE_POINTER_MEDIA_QUERY);
  return coarsePointerMediaQuery;
}

function subscribe(callback: () => void): () => void {
  const mediaQuery = getCoarsePointerMediaQuery();
  if (mediaQuery === undefined) return () => {};
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return getCoarsePointerMediaQuery()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
