import { CELL_FIELD_ATTRIBUTE, CELL_ROW_ATTRIBUTE } from "../../hooks/useCellNavigation";
import type { FieldTarget } from "../../model/types";

export type EditScope = FieldTarget["scope"];

const EDIT_TARGET_ATTRIBUTE = "data-edit-target";
const EDIT_SCOPE_ATTRIBUTE = "data-edit-scope";
const ID_SEPARATOR = ":";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const REACHABLE = ":not([disabled]):not([aria-hidden='true']):not([tabindex='-1'])";
const FIELD_SELECTOR = [`input:not([type='hidden'])${REACHABLE}`, `textarea${REACHABLE}`, `select${REACHABLE}`, `[role='combobox']${REACHABLE}`].join(
  ",",
);
const FOCUSABLE_SELECTOR = [FIELD_SELECTOR, `button${REACHABLE}`, "[tabindex]:not([tabindex='-1'])"].join(",");

function joinTargetId(scope: EditScope, owner?: string, field?: string): string {
  return [scope, owner ?? "", field ?? ""].join(ID_SEPARATOR);
}

export function toEditTargetId(target: FieldTarget): string {
  return joinTargetId(target.scope, target.key ?? target.rat, target.field);
}

export function editTargetProps(target: FieldTarget) {
  return { [EDIT_TARGET_ATTRIBUTE]: toEditTargetId(target) };
}

export function editScopeProps(scopes: readonly EditScope[]) {
  return { [EDIT_SCOPE_ATTRIBUTE]: scopes.join(" ") };
}

function listWiderTargetIds({ scope, key, rat, field }: FieldTarget): string[] {
  const ids: string[] = [];
  if (field !== undefined) ids.push(joinTargetId(scope, key ?? rat));
  if (key !== undefined && rat !== undefined) ids.push(joinTargetId(scope, rat));
  if (scope === "areaCode" && rat !== undefined) ids.push(joinTargetId("cell", rat));
  if (key !== undefined || rat !== undefined) ids.push(joinTargetId(scope));
  return ids;
}

function isShown(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function findShown(root: ParentNode, selector: string): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(selector)) if (isShown(element)) return element;
  return null;
}

function findTagged(root: ParentNode, targetId: string): HTMLElement | null {
  return findShown(root, `[${EDIT_TARGET_ATTRIBUTE}="${targetId}"]`);
}

function findCellPart(root: ParentNode, target: FieldTarget): HTMLElement | null {
  if (target.scope !== "cell" || target.key === undefined) return null;

  const row = findShown(root, `[${CELL_ROW_ATTRIBUTE}="${target.key}"]`);
  if (row === null || target.field === undefined) return row;
  return findShown(row, `[${CELL_FIELD_ATTRIBUTE}="${target.field}"]`) ?? row;
}

function findTargetPart(root: ParentNode, target: FieldTarget): HTMLElement | null {
  const exact = findTagged(root, toEditTargetId(target)) ?? findCellPart(root, target);
  if (exact !== null) return exact;

  for (const targetId of listWiderTargetIds(target)) {
    const wider = findTagged(root, targetId);
    if (wider !== null) return wider;
  }
  return null;
}

export function findEditTargetHolder(root: ParentNode, target: FieldTarget, holderAttribute: string): string | null {
  const selectors = [toEditTargetId(target), ...listWiderTargetIds(target)].map((targetId) => `[${EDIT_TARGET_ATTRIBUTE}="${targetId}"]`);
  if (target.scope === "cell" && target.key !== undefined) selectors.unshift(`[${CELL_ROW_ATTRIBUTE}="${target.key}"]`);

  for (const selector of selectors) {
    const holder = root.querySelector(selector)?.closest(`[${holderAttribute}]`) ?? null;
    if (holder !== null) return holder.getAttribute(holderAttribute);
  }
  return null;
}

function findControl(part: HTMLElement): HTMLElement {
  if (part.matches(FOCUSABLE_SELECTOR)) return part;
  return findShown(part, FIELD_SELECTOR) ?? findShown(part, FOCUSABLE_SELECTOR) ?? part;
}

function getScrollBehavior(): ScrollBehavior {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
}

export function focusEditTarget(root: ParentNode, target: FieldTarget): void {
  const part = findTargetPart(root, target);
  if (part !== null) {
    const control = findControl(part);
    control.scrollIntoView({ block: "center", behavior: getScrollBehavior() });
    control.focus({ preventScroll: true });
    if (control instanceof HTMLInputElement) control.select();
    return;
  }

  const area = findShown(root, `[${EDIT_SCOPE_ATTRIBUTE}~="${target.scope}"]`);
  if (area === null) return;

  area.scrollIntoView({ block: "start", behavior: getScrollBehavior() });
  area.focus({ preventScroll: true });
}
