import type { NsgCell } from "./types";

export type NsgSnapshot = Readonly<{
  eventIndex: number;
  timestampMs: number;
  cells: readonly NsgCell[];
}>;

export type NsgSnapshotCollection = Readonly<{
  snapshots: readonly NsgSnapshot[];
  indexByEvent: ReadonlyMap<number, number>;
}>;

export function createNsgSnapshotCollection(cells: readonly NsgCell[]): NsgSnapshotCollection {
  const cellsByEvent = new Map<number, NsgCell[]>();
  for (const cell of cells) {
    const eventCells = cellsByEvent.get(cell.eventIndex);
    if (eventCells) eventCells.push(cell);
    else cellsByEvent.set(cell.eventIndex, [cell]);
  }

  const snapshots = [...cellsByEvent]
    .map(([eventIndex, eventCells]) => ({ eventIndex, cells: eventCells, timestampMs: eventCells[0].timestampMs }))
    .sort((left, right) => left.timestampMs - right.timestampMs || left.eventIndex - right.eventIndex);
  const indexByEvent = new Map(snapshots.map((snapshot, index) => [snapshot.eventIndex, index]));

  return { snapshots, indexByEvent };
}

export function getPrimaryNsgCell(cells: readonly NsgCell[]): NsgCell | undefined {
  return cells.find((cell) => cell.registered === true) ?? cells[0];
}

export function findNearestNsgSnapshotIndex(snapshots: readonly NsgSnapshot[], timestampMs: number | null): number {
  if (timestampMs === null || snapshots.length === 0) return 0;

  let low = 0;
  let high = snapshots.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (snapshots[middle].timestampMs < timestampMs) low = middle + 1;
    else high = middle;
  }

  if (low === 0) return 0;
  if (low === snapshots.length) return low - 1;
  return timestampMs - snapshots[low - 1].timestampMs <= snapshots[low].timestampMs - timestampMs ? low - 1 : low;
}
