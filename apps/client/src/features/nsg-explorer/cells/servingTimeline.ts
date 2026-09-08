import { convertNsgTimestampUsToMs, parseNsgTimestampUs } from "@/lib/nsg-parser";
import type { NsgCell } from "@/lib/nsg-parser/model";

export const MAX_SIGNAL_AGE_MS = 10_000;

export type SimIdentity = Pick<NsgCell, "slotId" | "subId">;
export type ServingCellScope = SimIdentity | "all";
export type ServingCellSnapshot = {
  timestampUs: bigint;
  timestampMs: number;
  eventIndex: number;
  serving: NsgCell[];
};
export type ServingCellResolution =
  | { status: "available"; measurement: NsgCell }
  | { status: "missing" | "stale" | "ambiguous" | "invalid"; measurement: null };

function precedingSnapshotByMs(snapshots: readonly ServingCellSnapshot[], timestampMs: number): ServingCellSnapshot | null {
  let low = 0;
  let high = snapshots.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (snapshots[middle].timestampMs <= timestampMs) low = middle + 1;
    else high = middle;
  }
  return low === 0 ? null : snapshots[low - 1];
}

function precedingSnapshotByUs(snapshots: readonly ServingCellSnapshot[], timestampUs: bigint): ServingCellSnapshot | null {
  let low = 0;
  let high = snapshots.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (snapshots[middle].timestampUs <= timestampUs) low = middle + 1;
    else high = middle;
  }
  return low === 0 ? null : snapshots[low - 1];
}

export function createServingCellTimeline(cells: readonly NsgCell[], scope: ServingCellScope | null): ServingCellSnapshot[] {
  if (scope === null || (scope !== "all" && scope.slotId === null && scope.subId === null)) return [];
  const groups = new Map<string, ServingCellSnapshot>();
  for (const cell of cells) {
    if (scope !== "all" && (cell.slotId !== scope.slotId || cell.subId !== scope.subId)) continue;
    const key = scope === "all" ? `${cell.eventIndex}:${cell.slotId ?? "?"}:${cell.subId ?? "?"}` : String(cell.eventIndex);
    let snapshot = groups.get(key);
    if (!snapshot) {
      const timestampUs = parseNsgTimestampUs(cell.timestampUs);
      if (timestampUs === null) continue;
      const timestampMs = convertNsgTimestampUsToMs(timestampUs);
      if (timestampMs === null) continue;
      snapshot = { eventIndex: cell.eventIndex, timestampUs, timestampMs, serving: [] };
      groups.set(key, snapshot);
    }
    if (cell.registered === true) snapshot.serving.push(cell);
  }
  return [...groups.values()]
    .sort((left, right) => {
      if (left.timestampUs < right.timestampUs) return -1;
      if (left.timestampUs > right.timestampUs) return 1;
      if (left.eventIndex !== right.eventIndex) return left.eventIndex - right.eventIndex;
      if (left.serving.length === 0 || right.serving.length === 0) return left.serving.length - right.serving.length;
      const leftCellIndex = left.serving.at(-1)?.cellIndex ?? -1;
      const rightCellIndex = right.serving.at(-1)?.cellIndex ?? -1;
      return leftCellIndex - rightCellIndex;
    })
    .map((snapshot) => ({ ...snapshot, serving: snapshot.serving.sort((left, right) => left.cellIndex - right.cellIndex) }));
}

export function resolveServingCellAt(
  snapshots: readonly ServingCellSnapshot[],
  timestampMs: number,
  timestampUs?: bigint,
): { ageMs: number | null; resolution: ServingCellResolution } {
  if (!Number.isFinite(timestampMs)) return { ageMs: null, resolution: { status: "invalid", measurement: null } };
  const snapshot = timestampUs === undefined ? precedingSnapshotByMs(snapshots, timestampMs) : precedingSnapshotByUs(snapshots, timestampUs);
  if (snapshot === null) return { ageMs: null, resolution: { status: "missing", measurement: null } };
  const ageMs = timestampUs === undefined ? timestampMs - snapshot.timestampMs : Number(timestampUs - snapshot.timestampUs) / 1000;
  if (ageMs < 0) return { ageMs, resolution: { status: "missing", measurement: null } };
  if (ageMs > MAX_SIGNAL_AGE_MS) return { ageMs, resolution: { status: "stale", measurement: null } };
  if (snapshot.serving.length === 0) return { ageMs, resolution: { status: "missing", measurement: null } };
  if (snapshot.serving.length > 1) return { ageMs, resolution: { status: "ambiguous", measurement: null } };
  return { ageMs, resolution: { status: "available", measurement: snapshot.serving[0] } };
}
