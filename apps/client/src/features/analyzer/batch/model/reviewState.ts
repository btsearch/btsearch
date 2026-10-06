import type { DraftRow } from "../../model/draft";
import type { ExcludedFields, FieldChoice } from "./fieldSelection";
import type { CellNumberField } from "@/features/station-editing/model/types";

export type BatchReview = {
  removedRows: ReadonlySet<number>;
  removedStations: ReadonlySet<number>;
  excludedFields: ExcludedFields;
};

export type BatchAction =
  | { type: "removeRow"; index: number }
  | { type: "restoreRow"; index: number }
  | { type: "removeStation"; stationId: number }
  | { type: "restoreStation"; stationId: number }
  | { type: "keepRow"; index: number; rivals: readonly number[] }
  | { type: "setFields"; fields: readonly FieldChoice[]; included: boolean }
  | { type: "restoreAll" };

export const EMPTY_BATCH_REVIEW: BatchReview = { removedRows: new Set(), removedStations: new Set(), excludedFields: new Map() };

const NO_FIELDS: ReadonlySet<CellNumberField> = new Set();

function withValues(values: ReadonlySet<number>, added: readonly number[]): ReadonlySet<number> {
  if (added.every((value) => values.has(value))) return values;
  return new Set([...values, ...added]);
}

function withoutValue(values: ReadonlySet<number>, removed: number): ReadonlySet<number> {
  if (!values.has(removed)) return values;

  const next = new Set(values);
  next.delete(removed);
  return next;
}

function setFields(state: BatchReview, action: Extract<BatchAction, { type: "setFields" }>): BatchReview {
  const excludedFields = new Map(state.excludedFields);
  let isChanged = false;
  for (const choice of action.fields) {
    if (choice.required || !isRowActive(state, choice)) continue;
    const previous = excludedFields.get(choice.index) ?? NO_FIELDS;
    if (previous.has(choice.field) === !action.included) continue;
    const fields = new Set(previous);
    if (action.included) fields.delete(choice.field);
    else fields.add(choice.field);
    if (fields.size === 0) excludedFields.delete(choice.index);
    else excludedFields.set(choice.index, fields);
    isChanged = true;
  }
  return isChanged ? { ...state, excludedFields } : state;
}

export function batchReducer(state: BatchReview, action: BatchAction): BatchReview {
  if (action.type === "setFields") return setFields(state, action);
  if (action.type === "restoreAll") return hasRemovals(state) ? { ...state, removedRows: new Set(), removedStations: new Set() } : state;

  let { removedRows, removedStations } = state;
  if (action.type === "removeRow") removedRows = withValues(removedRows, [action.index]);
  if (action.type === "restoreRow") removedRows = withoutValue(removedRows, action.index);
  if (action.type === "keepRow") removedRows = withValues(withoutValue(removedRows, action.index), action.rivals);
  if (action.type === "removeStation") removedStations = withValues(removedStations, [action.stationId]);
  if (action.type === "restoreStation") removedStations = withoutValue(removedStations, action.stationId);

  return removedRows === state.removedRows && removedStations === state.removedStations ? state : { ...state, removedRows, removedStations };
}

export function hasRemovals(review: BatchReview): boolean {
  return review.removedRows.size > 0 || review.removedStations.size > 0;
}

export function isRowActive(review: BatchReview, row: Pick<DraftRow, "index" | "stationId">): boolean {
  return !review.removedRows.has(row.index) && !review.removedStations.has(row.stationId);
}
