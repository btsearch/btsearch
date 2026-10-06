import type { Cell } from "@openbts/shared/contract";

import type { BatchRow } from "./batchRows";
import { getNewLteTac } from "./conflicts";

export type TacSpread = {
  tac: number;
  cellIds: number[];
  firstRowIndex: number;
};

export function planTacSpread(activeRows: readonly BatchRow[], stationCells: readonly Cell[]): TacSpread | null {
  const setters = activeRows.filter((row) => getNewLteTac(row) !== null);
  const newTacs = new Set(setters.map(getNewLteTac));
  const [first] = setters;
  const tac = first === undefined ? null : getNewLteTac(first);
  if (first === undefined || tac === null || newTacs.size !== 1) return null;

  const setterCellIds = new Set(setters.map((row) => row.cellId));
  const cellIds = stationCells.flatMap((cell) => (cell.rat === "lte" && cell.tac !== tac && !setterCellIds.has(cell.id) ? [cell.id] : []));
  return { tac, cellIds, firstRowIndex: first.index };
}
