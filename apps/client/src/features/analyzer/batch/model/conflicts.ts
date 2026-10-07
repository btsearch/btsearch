import { type BatchRow, type RowNumbers, getNewCellKey, getRowNumbers, getRowRat } from "./batchRows";
import { isCellNumberField } from "@/features/station-editing/model/ratFields";
import type { CellNumberField } from "@/features/station-editing/model/types";

export type RowConflict = {
  rival: number;
  field: CellNumberField;
  rivals: number[];
};

type ConflictTarget = {
  row: BatchRow;
  numbers: RowNumbers;
  newCellKey: string | null;
  newTac: number | null;
};

type Rival = {
  index: number;
  field: CellNumberField;
};

const TAC_FIELD: CellNumberField = "tac";

export function getNewLteTac(row: BatchRow): number | null {
  if (getRowRat(row) !== "lte" || row.action === "confirm") return null;
  return getRowNumbers(row).tac ?? null;
}

function toConflictTarget(row: BatchRow): ConflictTarget {
  const numbers = getRowNumbers(row);
  return { row, numbers, newCellKey: row.action === "create" ? getNewCellKey(row, numbers) : null, newTac: getNewLteTac(row) };
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
  return left.newTac !== null && right.newTac !== null && left.newTac !== right.newTac ? TAC_FIELD : null;
}

function listRivals(target: ConflictTarget, targets: readonly ConflictTarget[]): Rival[] {
  return targets.flatMap((other) => {
    const field = other === target ? null : findContradiction(target, other);
    return field === null ? [] : [{ index: other.row.index, field }];
  });
}

export function findConflicts(activeRows: readonly BatchRow[]): ReadonlyMap<number, RowConflict> {
  const targets = activeRows.map(toConflictTarget);
  const conflicts = new Map<number, RowConflict>();

  for (const target of targets) {
    const rivals = listRivals(target, targets);
    const [first] = rivals;
    if (first !== undefined) conflicts.set(target.row.index, { rival: first.index, field: first.field, rivals: rivals.map((rival) => rival.index) });
  }
  return conflicts;
}
