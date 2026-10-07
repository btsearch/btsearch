import { getSectorCellCounts } from "../../model/changes";
import { MAX_SECTORS, OMNIDIRECTIONAL_DEGREES } from "../../model/ratFields";
import { createSectorDraft } from "../../model/snapshots";
import type { DraftKey, SectorDraft, StationSnapshot } from "../../model/types";

export type PreviewLine = {
  id: string;
  kind: "changed" | "unchanged" | "added";
  rowKey: DraftKey | null;
  current: number | null;
  next: number;
  cellCount: number;
};

type Pairing = {
  rowKey: DraftKey;
  next: number;
  distance: number;
};

const FULL_TURN = 360;
const FARTHEST_PAIRED_TURN = 60;

function getTurn(from: number, to: number): number {
  const difference = Math.abs(from - to) % FULL_TURN;
  return Math.min(difference, FULL_TURN - difference);
}

function isDirection(degrees: number | null): degrees is number {
  return degrees !== null && degrees >= 0 && degrees < OMNIDIRECTIONAL_DEGREES;
}

function listNearPairings(rows: readonly SectorDraft[], values: readonly number[]): Pairing[] {
  const pairings = rows.flatMap((row) => {
    const { degrees } = row;
    if (!isDirection(degrees)) return [];
    return values.filter(isDirection).map((next): Pairing => ({ rowKey: row.key, next, distance: getTurn(degrees, next) }));
  });
  return pairings.filter((pairing) => pairing.distance <= FARTHEST_PAIRED_TURN).sort((left, right) => left.distance - right.distance);
}

function pairRows(sectors: readonly SectorDraft[], fetchedDegrees: readonly number[]): Map<DraftKey, number> {
  const nextByRow = new Map<DraftKey, number>();
  const takenValues = new Set<number>();

  for (const value of fetchedDegrees) {
    const row = sectors.find((sector) => sector.degrees === value && !nextByRow.has(sector.key));
    if (row === undefined) continue;
    nextByRow.set(row.key, value);
    takenValues.add(value);
  }

  const freeRows = sectors.filter((sector) => !nextByRow.has(sector.key));
  const freeValues = fetchedDegrees.filter((value) => !takenValues.has(value));
  for (const pairing of listNearPairings(freeRows, freeValues)) {
    if (nextByRow.has(pairing.rowKey) || takenValues.has(pairing.next)) continue;
    nextByRow.set(pairing.rowKey, pairing.next);
    takenValues.add(pairing.next);
  }
  return nextByRow;
}

export function buildPreviewLines(snapshot: StationSnapshot, fetchedDegrees: readonly number[]): PreviewLine[] {
  const { sectors } = snapshot;
  const cellCounts = getSectorCellCounts(snapshot);
  const nextByRow = pairRows(sectors, fetchedDegrees);
  const pairedValues = new Set(nextByRow.values());
  const emptyRows = sectors.filter((sector) => sector.degrees === null && !nextByRow.has(sector.key));
  const newValues = fetchedDegrees.filter((value) => !pairedValues.has(value)).slice(0, emptyRows.length + MAX_SECTORS - sectors.length);

  const pairedLines = sectors.flatMap((sector): PreviewLine[] => {
    const next = nextByRow.get(sector.key);
    if (next === undefined) return [];

    const kind = next === sector.degrees ? "unchanged" : "changed";
    return [{ id: `row:${sector.key}`, kind, rowKey: sector.key, current: sector.degrees, next, cellCount: cellCounts.get(sector.key) ?? 0 }];
  });
  const addedLines = newValues.map((next, position): PreviewLine => {
    const rowKey = emptyRows.at(position)?.key ?? null;
    return { id: `new:${next}`, kind: "added", rowKey, current: null, next, cellCount: 0 };
  });
  return [...pairedLines, ...addedLines];
}

export function listChangeIds(lines: readonly PreviewLine[]): string[] {
  return lines.filter((line) => line.kind !== "unchanged").map((line) => line.id);
}

export function applyPreviewLines(sectors: readonly SectorDraft[], lines: readonly PreviewLine[], tickedIds: ReadonlySet<string>): SectorDraft[] {
  const applied = lines.filter((line) => line.kind !== "unchanged" && tickedIds.has(line.id));
  const nextByRow = new Map<DraftKey, number>();
  for (const line of applied) if (line.rowKey !== null) nextByRow.set(line.rowKey, line.next);

  const rows = sectors.map((sector) => {
    const next = nextByRow.get(sector.key);
    return next === undefined || next === sector.degrees ? sector : { ...sector, degrees: next };
  });
  const addedRows = applied.filter((line) => line.rowKey === null).map((line) => createSectorDraft(line.next));
  return [...rows, ...addedRows].slice(0, MAX_SECTORS);
}
