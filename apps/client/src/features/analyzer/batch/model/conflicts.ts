import type { SharedAreaCode } from "@openbts/shared/contract";

import { type BatchRow, type RowNumbers, getNewCellKey, getRowNumbers, getRowRat } from "./batchRows";
import { isCellNumberField } from "@/features/station-editing/model/ratFields";
import type { CellNumberField, Rat } from "@/features/station-editing/model/types";

export type RowConflict = {
  rival: number;
  field: CellNumberField;
  rivals: number[];
};

export type SharedTacRat = Extract<Rat, "lte" | "nr">;
type NewTac = { rat: SharedTacRat; tac: number };

type ConflictTarget = {
  row: BatchRow;
  numbers: RowNumbers;
  newCellKey: string | null;
  newTac: NewTac | null;
};

type Rival = {
  index: number;
  field: CellNumberField;
};

const TAC_FIELD: CellNumberField = "tac";

export function getNewTac(row: BatchRow, rat: SharedTacRat): number | null {
  if (getRowRat(row) !== rat || row.action === "confirm") return null;
  return getRowNumbers(row).tac ?? null;
}

function findNewSharedTac(row: BatchRow, sharedAreaCode: SharedAreaCode): NewTac | null {
  const rat = getRowRat(row);
  if ((rat !== "lte" && rat !== "nr") || !sharedAreaCode[rat]) return null;
  const tac = getNewTac(row, rat);
  return tac === null ? null : { rat, tac };
}

function toConflictTarget(row: BatchRow, sharedAreaCode: SharedAreaCode): ConflictTarget {
  const numbers = getRowNumbers(row);
  return { row, numbers, newCellKey: row.action === "create" ? getNewCellKey(row, numbers) : null, newTac: findNewSharedTac(row, sharedAreaCode) };
}

function isOtherTacOfSameRat(left: NewTac | null, right: NewTac | null): boolean {
  return left !== null && right !== null && left.rat === right.rat && left.tac !== right.tac;
}

function findDifferingField(left: RowNumbers, right: RowNumbers): CellNumberField | null {
  for (const field of Object.keys(left).filter(isCellNumberField)) {
    const rightValue = right[field];
    if (rightValue !== undefined && rightValue !== left[field]) return field;
  }
  return null;
}

function findContradiction(left: ConflictTarget, right: ConflictTarget): CellNumberField | null {
  const isSameCell = left.row.cellId !== null && left.row.cellId === right.row.cellId;
  const isSameNewCell = left.newCellKey !== null && left.newCellKey === right.newCellKey;
  const differingField = isSameCell || isSameNewCell ? findDifferingField(left.numbers, right.numbers) : null;

  if (differingField !== null) return differingField;
  return isOtherTacOfSameRat(left.newTac, right.newTac) ? TAC_FIELD : null;
}

function listRivals(target: ConflictTarget, targets: readonly ConflictTarget[]): Rival[] {
  return targets.flatMap((other) => {
    const field = other === target ? null : findContradiction(target, other);
    return field === null ? [] : [{ index: other.row.index, field }];
  });
}

export function findConflicts(activeRows: readonly BatchRow[], sharedAreaCode: SharedAreaCode): ReadonlyMap<number, RowConflict> {
  const targets = activeRows.map((row) => toConflictTarget(row, sharedAreaCode));
  const conflicts = new Map<number, RowConflict>();

  for (const target of targets) {
    const rivals = listRivals(target, targets);
    const [first] = rivals;
    if (first !== undefined) conflicts.set(target.row.index, { rival: first.index, field: first.field, rivals: rivals.map((rival) => rival.index) });
  }
  return conflicts;
}
