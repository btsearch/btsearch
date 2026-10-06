import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";

import type { DraftDispatch } from "../model/draftReducer";
import { newDraftKey } from "../model/snapshots";
import type { DraftKey, Rat, RowKind } from "../model/types";

export const CELL_ROW_ATTRIBUTE = "data-cell-row";
export const CELL_FIELD_ATTRIBUTE = "data-field";

const CELL_ROW_KIND_ATTRIBUTE = "data-row-kind";
const CELL_CONTROL_ATTRIBUTE = "data-nav-cell";

export const CELL_CONTROL_PROPS = { [CELL_CONTROL_ATTRIBUTE]: true } as const;

type CellNavigationOptions = {
  rat: Rat;
  canEdit: boolean;
  isNewCellConfirmed: boolean;
  dispatch: DraftDispatch;
};

type CellNavigation = {
  bodyRef: RefObject<HTMLDivElement | null>;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

type PendingFocus = {
  rowKey: DraftKey;
  field: string | null;
};

type RowShortcut = "addRow" | "duplicateRow" | "rowBelow" | "rowAbove" | "nextField" | "previousField";
type RowStep = 1 | -1;

const ROW_SELECTOR = `[${CELL_ROW_ATTRIBUTE}]`;
const FIELD_SELECTOR = `[${CELL_FIELD_ATTRIBUTE}]`;
const CONTROL_SELECTOR = `[${CELL_CONTROL_ATTRIBUTE}]`;
const UNREACHABLE_SELECTOR = ":disabled, [data-disabled], [aria-disabled='true']";
const DELETED_ROW_KIND = "deleted";
const DUPLICATE_KEY = "d";

export function cellRowProps(rowKey: DraftKey, rowKind?: RowKind) {
  return { [CELL_ROW_ATTRIBUTE]: rowKey, [CELL_ROW_KIND_ATTRIBUTE]: rowKind };
}

export function cellFieldProps(field: string) {
  return { [CELL_FIELD_ATTRIBUTE]: field };
}

function isReachable(control: HTMLElement): boolean {
  return !control.matches(UNREACHABLE_SELECTOR) && control.getClientRects().length > 0;
}

function listRowControls(row: Element): HTMLElement[] {
  return [...row.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].filter(isReachable);
}

function findFieldControl(row: Element, field: string): HTMLElement | null {
  const controls = [...row.querySelectorAll<HTMLElement>(`[${CELL_FIELD_ATTRIBUTE}="${field}"] ${CONTROL_SELECTOR}`)];
  return controls.find(isReachable) ?? null;
}

function focusControl(control: HTMLElement): void {
  control.focus({ focusVisible: true });
  if (control instanceof HTMLInputElement) control.select();
}

function focusRowField(root: ParentNode, rowKey: DraftKey, field: string | null): void {
  const row = root.querySelector(`[${CELL_ROW_ATTRIBUTE}="${rowKey}"]`);
  if (row === null) return;

  const control = (field === null ? null : findFieldControl(row, field)) ?? listRowControls(row)[0] ?? null;
  if (control !== null) focusControl(control);
}

function moveAlongRow(row: Element, control: HTMLElement, step: RowStep): void {
  const controls = listRowControls(row);
  const index = controls.indexOf(control);
  const target = index === -1 ? undefined : controls[index + step];
  if (target !== undefined) focusControl(target);
}

function moveBetweenRows(row: Element, field: string | null, step: RowStep): void {
  if (field === null) return;

  let sibling = step === 1 ? row.nextElementSibling : row.previousElementSibling;
  while (sibling !== null) {
    const control = sibling.matches(ROW_SELECTOR) ? findFieldControl(sibling, field) : null;
    if (control !== null) {
      focusControl(control);
      return;
    }
    sibling = step === 1 ? sibling.nextElementSibling : sibling.previousElementSibling;
  }
}

function readShortcut(event: KeyboardEvent<HTMLDivElement>, isTextField: boolean): RowShortcut | null {
  if (event.nativeEvent.isComposing || event.shiftKey || event.altKey) return null;

  const hasCommandKey = event.ctrlKey || event.metaKey;
  if (event.key === "Enter" && hasCommandKey) return "addRow";
  if (event.key === "Enter") return isTextField ? "rowBelow" : null;
  if (hasCommandKey && event.key.toLowerCase() === DUPLICATE_KEY) return "duplicateRow";
  if (!event.ctrlKey) return null;
  if (event.key === "ArrowDown") return "rowBelow";
  if (event.key === "ArrowUp") return "rowAbove";
  if (event.key === "ArrowRight") return "nextField";
  if (event.key === "ArrowLeft") return "previousField";
  return null;
}

export function useCellNavigation({ rat, canEdit, isNewCellConfirmed, dispatch }: CellNavigationOptions): CellNavigation {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;
    const body = bodyRef.current;
    if (pending === null || body === null) return;

    pendingFocus.current = null;
    focusRowField(body, pending.rowKey, pending.field);
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement)) return;

    const control = event.target.closest<HTMLElement>(CONTROL_SELECTOR);
    const row = event.target.closest<HTMLElement>(ROW_SELECTOR);
    const rowKey = row?.getAttribute(CELL_ROW_ATTRIBUTE) ?? null;
    if (control === null || row === null || rowKey === null) return;

    const shortcut = readShortcut(event, control instanceof HTMLInputElement);
    const isRowEdit = shortcut === "addRow" || shortcut === "duplicateRow";
    const isDeletedRow = row.getAttribute(CELL_ROW_KIND_ATTRIBUTE) === DELETED_ROW_KIND;
    if (shortcut === null || (isRowEdit && !canEdit) || (shortcut === "duplicateRow" && isDeletedRow)) return;

    event.preventDefault();
    event.stopPropagation();

    const field = control.closest(FIELD_SELECTOR)?.getAttribute(CELL_FIELD_ATTRIBUTE) ?? null;
    if (shortcut === "rowBelow") moveBetweenRows(row, field, 1);
    if (shortcut === "rowAbove") moveBetweenRows(row, field, -1);
    if (shortcut === "nextField") moveAlongRow(row, control, 1);
    if (shortcut === "previousField") moveAlongRow(row, control, -1);
    if (!isRowEdit) return;

    const newKey = newDraftKey();
    pendingFocus.current = { rowKey: newKey, field };
    if (shortcut === "addRow") dispatch({ type: "addCell", rat, isConfirmed: isNewCellConfirmed, afterKey: rowKey, newKey });
    else dispatch({ type: "duplicateCell", key: rowKey, newKey });
  }

  return { bodyRef, handleKeyDown };
}
