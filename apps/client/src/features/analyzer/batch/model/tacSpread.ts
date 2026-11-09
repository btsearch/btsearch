import type { SharedAreaCode, StationCell } from "@openbts/shared/contract";

import type { BatchRow } from "./batchRows";
import { type SharedTacRat, getNewTac } from "./conflicts";

export type TacSpread = {
  rat: SharedTacRat;
  tac: number;
  cellIds: number[];
  firstRowIndex: number;
};

const SHARED_TAC_RATS: readonly SharedTacRat[] = ["lte", "nr"];

function readStationTac(cell: StationCell, rat: SharedTacRat): number | null | undefined {
  if (cell.rat === "lte" && rat === "lte") return cell.tac;
  if (cell.rat === "nr" && rat === "nr" && cell.mode === "sa") return cell.tac;
  return undefined;
}

function planTacSpread(rat: SharedTacRat, activeRows: readonly BatchRow[], stationCells: readonly StationCell[]): TacSpread | null {
  const setters = activeRows.filter((row) => getNewTac(row, rat) !== null);
  const newTacs = new Set(setters.map((row) => getNewTac(row, rat)));
  const [first] = setters;
  const tac = first === undefined ? null : getNewTac(first, rat);
  if (first === undefined || tac === null || newTacs.size !== 1) return null;

  const setterCellIds = new Set(setters.map((row) => row.cellId));
  const cellIds = stationCells.flatMap((cell) => {
    const storedTac = readStationTac(cell, rat);
    return storedTac !== undefined && storedTac !== tac && !setterCellIds.has(cell.id) ? [cell.id] : [];
  });
  return { rat, tac, cellIds, firstRowIndex: first.index };
}

export function countSpreadCells(spreads: readonly TacSpread[]): number {
  return spreads.reduce((count, spread) => count + spread.cellIds.length, 0);
}

export function planTacSpreads(activeRows: readonly BatchRow[], stationCells: readonly StationCell[], sharedAreaCode: SharedAreaCode): TacSpread[] {
  return SHARED_TAC_RATS.flatMap((rat) => (sharedAreaCode[rat] ? (planTacSpread(rat, activeRows, stationCells) ?? []) : []));
}
