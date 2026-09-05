import { getNsgLocationTimeMs } from "./locations";
import type { NsgLocation } from "./types";

const PLAYBACK_RATE = 5;

export function advanceNsgReplay(
  snapshots: readonly { timestampMs: number }[],
  playheadMs: number,
  wallElapsedMs: number,
): { index: number; playheadMs: number; finished: boolean } {
  if (snapshots.length === 0) return { index: -1, playheadMs, finished: true };

  const lastTimestampMs = snapshots[snapshots.length - 1].timestampMs;
  const elapsedMs = Number.isFinite(wallElapsedMs) ? Math.max(0, wallElapsedMs) * PLAYBACK_RATE : 0;
  const nextPlayheadMs = Math.min(Math.max(playheadMs, snapshots[0].timestampMs) + elapsedMs, lastTimestampMs);
  let low = 0;
  let high = snapshots.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (snapshots[middle].timestampMs <= nextPlayheadMs) low = middle + 1;
    else high = middle;
  }

  return { index: low - 1, playheadMs: nextPlayheadMs, finished: nextPlayheadMs === lastTimestampMs };
}

export function getNsgReplayLocationIndex(locations: readonly NsgLocation[], playheadMs: number): number {
  if (!Number.isFinite(playheadMs)) return -1;
  let low = 0;
  let high = locations.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (getNsgLocationTimeMs(locations[middle])! <= playheadMs) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}
