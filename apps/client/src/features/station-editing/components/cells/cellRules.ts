import type { StationDraftApi } from "../../hooks/useStationDraft";
import { type CellToolId, type CellToolInput, type ConfirmScope, listCellTools } from "../../model/cellTools";
import { getCellRowState } from "../../model/changes";
import { findDraftOperator } from "../../model/snapshots";
import type { CellDraft, CellRowState, DraftKey, EditError, FieldTarget, Rat, TextValues } from "../../model/types";
import { NO_EDIT_ERRORS } from "../../model/validate";
import { type CellColumn, NO_SITE_SWITCHES, listCellColumns } from "./cellGrid";
import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import { shallowEqual } from "@/lib/shallowEqual";

export type CellErrorIndex = ReadonlyMap<DraftKey, EditError[]>;

type CellRowView = {
  cell: CellDraft;
  state: CellRowState;
  errors: readonly EditError[];
};

const errorsByCell = new WeakMap<CellDraft, readonly EditError[]>();

export function canEditCells(edit: StationDraftApi): boolean {
  return edit.canEdit && edit.session.action !== "delete";
}

export function getFirstBandId(edit: StationDraftApi, rat: Rat): number | null {
  if (edit.session.kind === "form") return null;
  return edit.lookups.planBands[rat][0]?.id ?? null;
}

function getOperatorMnc(edit: StationDraftApi): number | null {
  return toV1OperatorMnc(findDraftOperator(edit.session.draft, edit.lookups.operatorsById));
}

function hasSameValues(left: TextValues | undefined, right: TextValues | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return shallowEqual(left, right);
}

function isSameError(left: EditError, right: EditError | undefined): boolean {
  if (right === undefined || left.messageKey !== right.messageKey || left.isQuiet !== right.isQuiet) return false;

  const isSameTarget =
    left.target.scope === right.target.scope &&
    left.target.key === right.target.key &&
    left.target.rat === right.target.rat &&
    left.target.field === right.target.field;
  return isSameTarget && hasSameValues(left.values, right.values);
}

function keepKnownErrors(cell: CellDraft, errors: readonly EditError[]): readonly EditError[] {
  const known = errorsByCell.get(cell);
  if (known !== undefined && known.length === errors.length && known.every((error, index) => isSameError(error, errors[index]))) return known;

  errorsByCell.set(cell, errors);
  return errors;
}

export function listRowViews(edit: StationDraftApi, rat: Rat, errorsByKey: CellErrorIndex): CellRowView[] {
  const { session, context } = edit;
  return session.draft.cells.flatMap((cell) => {
    if (cell.rat !== rat) return [];

    const errors = errorsByKey.get(cell.key);
    const rowErrors = errors === undefined ? NO_EDIT_ERRORS : keepKnownErrors(cell, errors);
    return [{ cell, state: getCellRowState(session, context, cell), errors: rowErrors }];
  });
}

export function isUnchangedRow(row: CellRowView): boolean {
  return row.state.kind === "same" && row.errors.length === 0;
}

export function isRatTarget(target: FieldTarget, rat: Rat, rows: readonly CellRowView[]): boolean {
  if (target.scope !== "cell" && target.scope !== "areaCode") return false;
  if (target.key === undefined) return target.rat === rat;
  return rows.some((row) => row.cell.key === target.key);
}

export function isUnchangedTarget(target: FieldTarget, rows: readonly CellRowView[]): boolean {
  return rows.some((row) => row.cell.key === target.key && isUnchangedRow(row));
}

function listShownColumns(edit: StationDraftApi, rat: Rat, hasStandaloneCells: boolean): readonly CellColumn[] {
  const { session, lookups } = edit;
  return listCellColumns({
    rat,
    hasConfirmedColumn: session.kind !== "form",
    hasStandaloneCells,
    isAreaCodePerCell: session.draft.areaCodes[rat].mode === "perCell",
    switches: lookups.features ?? NO_SITE_SWITCHES,
  });
}

export function listRatColumns(edit: StationDraftApi, rat: Rat): readonly CellColumn[] {
  return listShownColumns(
    edit,
    rat,
    edit.session.draft.cells.some((cell) => cell.rat === rat && cell.mode === "sa"),
  );
}

export function listSheetColumns(edit: StationDraftApi, cell: CellDraft): readonly CellColumn[] {
  return listShownColumns(edit, cell.rat, cell.mode === "sa");
}

export function listRatTools(edit: StationDraftApi, rat: Rat, canConfirm: boolean): CellToolId[] {
  if (!canEditCells(edit)) return [];
  return listCellTools(rat, { operatorMnc: getOperatorMnc(edit), hasConfirmTool: canConfirm && edit.session.kind !== "form" });
}

export function getToolInput(edit: StationDraftApi, rat: Rat): CellToolInput {
  const { session, lookups } = edit;
  const confirmScope: ConfirmScope = session.kind === "review" ? "new" : "all";
  return { cells: session.draft.cells, rat, bandsById: lookups.bandsById, operatorMnc: getOperatorMnc(edit), confirmScope };
}

function isRowlessCellError(error: EditError): boolean {
  return error.target.scope === "cell" && error.target.key === undefined;
}

export function listCardErrors(errors: readonly EditError[], rat: Rat): EditError[] {
  return errors.filter((error) => isRowlessCellError(error) && error.target.rat === rat);
}

export function listPanelErrors(errors: readonly EditError[]): EditError[] {
  return errors.filter((error) => {
    const isCellLimit = error.target.scope === "general" && error.target.field === "cells";
    return isCellLimit || (isRowlessCellError(error) && error.target.rat === undefined);
  });
}
