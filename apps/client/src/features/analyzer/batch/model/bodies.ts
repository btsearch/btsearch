import type { CellApply, CellApplyChange, SubmissionCreate } from "@openbts/shared/contract";

import { type BatchRow, type RowNumbers, getNewCellKey, getRowNumbers, getRowRat } from "./batchRows";
import type { TacSpread } from "./tacSpread";
import { DEFAULT_CELL_TYPE, MAX_CELL_CHANGES } from "@/features/station-editing/model/ratFields";
import type { Rat } from "@/features/station-editing/model/types";
import { splitIntoChunks } from "@/lib/splitIntoChunks";

export type SendMode = "submit" | "apply";
export type BuiltEntry = { change: CellApplyChange; rat: Rat; rowIndexes: number[] };
export type BuiltStation = { stationId: number; entries: BuiltEntry[] };

type CellCreateChange = Extract<CellApplyChange, { action: "create" }>;
type CellUpdateChange = Extract<CellApplyChange, { action: "update" }>;

type PendingEntry = {
  rat: Rat;
  cellId: number | null;
  bandId: number | null;
  numbers: RowNumbers;
  rowIndexes: number[];
};

const STANDALONE_MODE = "sa";
const SPREAD_RAT: Rat = "lte";

function toEntryKey(row: BatchRow, numbers: RowNumbers): string {
  return row.cellId === null ? getNewCellKey(row, numbers) : String(row.cellId);
}

function listPendingEntries(rows: readonly BatchRow[], mode: SendMode): PendingEntry[] {
  const entries = new Map<string, PendingEntry>();

  for (const row of rows) {
    if (row.action === "confirm" && mode === "submit") continue;

    const numbers = getRowNumbers(row);
    const key = toEntryKey(row, numbers);
    const known = entries.get(key);
    if (known === undefined) {
      entries.set(key, { rat: getRowRat(row), cellId: row.cellId, bandId: row.bandId, numbers: { ...numbers }, rowIndexes: [row.index] });
      continue;
    }

    Object.assign(known.numbers, numbers);
    known.rowIndexes.push(row.index);
    known.bandId ??= row.bandId;
  }
  return [...entries.values()];
}

function toCreateChange({ rat, bandId, numbers }: PendingEntry): CellCreateChange | null {
  if (bandId === null) return null;

  if (rat === "lte") {
    const created: Extract<CellCreateChange, { rat: "lte" }> = {
      action: "create",
      rat,
      bandId,
      enbid: numbers.enbid ?? null,
      clid: numbers.clid ?? null,
      cellType: DEFAULT_CELL_TYPE,
    };
    if (numbers.tac !== undefined) created.tac = numbers.tac;
    if (numbers.pci !== undefined) created.pci = numbers.pci;
    if (numbers.earfcn !== undefined) created.earfcn = numbers.earfcn;
    return created;
  }
  if (rat !== "nr") return null;

  const created: Extract<CellCreateChange, { rat: "nr" }> = { action: "create", rat, bandId, mode: STANDALONE_MODE, cellType: DEFAULT_CELL_TYPE };
  if (numbers.gnbid !== undefined) created.gnbid = numbers.gnbid;
  if (numbers.clid !== undefined) created.clid = numbers.clid;
  if (numbers.tac !== undefined) created.tac = numbers.tac;
  if (numbers.pci !== undefined) created.pci = numbers.pci;
  if (numbers.arfcn !== undefined) created.arfcn = numbers.arfcn;
  return created;
}

function toUpdateChange(cellId: number, numbers: RowNumbers, mode: SendMode): CellUpdateChange | null {
  if (mode === "submit" && Object.keys(numbers).length === 0) return null;
  return { ...numbers, action: "update", id: cellId };
}

function toBuiltEntry(entry: PendingEntry, mode: SendMode, stationTac: number | null): BuiltEntry[] {
  const numbers = stationTac !== null && entry.rat === SPREAD_RAT ? { ...entry.numbers, tac: stationTac } : entry.numbers;
  const change = entry.cellId === null ? toCreateChange({ ...entry, numbers }) : toUpdateChange(entry.cellId, numbers, mode);
  return change === null ? [] : [{ change, rat: entry.rat, rowIndexes: entry.rowIndexes }];
}

export function buildStationEntries(
  stationId: number,
  activeRows: readonly BatchRow[],
  mode: SendMode,
  spread: TacSpread | null,
): BuiltStation | null {
  const spreadPlan = mode === "submit" ? spread : null;
  const stationTac = spreadPlan === null ? null : spreadPlan.tac;
  const pending = listPendingEntries(activeRows, mode);
  const ordered = [...pending.filter((entry) => entry.cellId === null), ...pending.filter((entry) => entry.cellId !== null)];
  const entries = ordered.flatMap((entry) => toBuiltEntry(entry, mode, stationTac));

  if (spreadPlan !== null) {
    const ownCellIds = new Set(pending.map((entry) => entry.cellId));
    for (const cellId of spreadPlan.cellIds) {
      if (ownCellIds.has(cellId)) continue;
      entries.push({ change: { action: "update", id: cellId, tac: spreadPlan.tac }, rat: SPREAD_RAT, rowIndexes: [] });
    }
  }
  return entries.length === 0 ? null : { stationId, entries };
}

export function buildSubmissionItems(stations: readonly BuiltStation[], note: string): { items: SubmissionCreate[]; sources: BuiltStation[] } {
  const text = note.trim();
  const sources = stations.flatMap(({ stationId, entries }) =>
    splitIntoChunks(entries, MAX_CELL_CHANGES).map((group): BuiltStation => ({ stationId, entries: group })),
  );
  const items = sources.map(({ stationId, entries }) => {
    const item: SubmissionCreate = { action: "update", stationId, origin: "analyzer", cells: entries.map((entry) => entry.change) };
    if (text !== "") item.note = text;
    return item;
  });

  return { items, sources };
}

export function buildApplyBody(stations: readonly BuiltStation[]): CellApply[] {
  return stations.map(({ stationId, entries }) => ({ stationId, cells: entries.map((entry) => entry.change) }));
}

export function listSentRowIndexes(stations: readonly BuiltStation[]): number[] {
  return stations.flatMap((station) => station.entries.flatMap((entry) => entry.rowIndexes));
}
