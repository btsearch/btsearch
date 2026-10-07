import { useSyncExternalStore } from "react";

type ClockListener = () => void;

const MINUTE_MS = 60_000;

const clockListeners = new Set<ClockListener>();
let shownMinute = 0;
let tickTimer: ReturnType<typeof setTimeout> | undefined;

function readWallMinute(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

function showWallMinute(): void {
  const wallMinute = readWallMinute();
  if (wallMinute === shownMinute) return;

  shownMinute = wallMinute;
  for (const listener of clockListeners) listener();
}

function tick(): void {
  tickTimer = setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS));
  showWallMinute();
}

function pauseTicking(): void {
  clearTimeout(tickTimer);
  tickTimer = undefined;
}

function followTabVisibility(): void {
  pauseTicking();
  if (!document.hidden) tick();
}

function subscribeToClock(listener: ClockListener): () => void {
  if (clockListeners.size === 0) {
    document.addEventListener("visibilitychange", followTabVisibility);
    followTabVisibility();
  }
  clockListeners.add(listener);

  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size > 0) return;

    document.removeEventListener("visibilitychange", followTabVisibility);
    pauseTicking();
  };
}

function getShownMinute(): number {
  return tickTimer === undefined ? readWallMinute() : shownMinute;
}

export function useNow(): number {
  return useSyncExternalStore(subscribeToClock, getShownMinute);
}
