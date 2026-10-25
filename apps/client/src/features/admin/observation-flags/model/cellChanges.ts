import type { CellApply, CellApplyChange, CellType, StationCell } from "@openbts/shared/contract";
import type { CellRat } from "@openbts/shared/contract/constants";

import { type NumberedItem, readItemNumber } from "./format";
import type { StationRecord } from "@/features/station-details/station/types";
import { RAT_FIELDS, RAT_ORDER } from "@/features/station-editing/model/ratFields";
import type { CellNumberField } from "@/features/station-editing/model/types";

export type FieldEdits = Readonly<Record<string, string>>;

export type ChangeField = {
  field: CellNumberField;
  label: string;
  value: string;
  was: number | null;
  isEditable: boolean;
  isInvalid: boolean;
};

export type ChangeRow = {
  index: number;
  isNew: boolean;
  rat: CellRat;
  bandId: number | null;
  sectorAzimuth: number | null;
  cellType: CellType | null;
  plmns: readonly string[];
  wasPlmns: readonly string[] | null;
  fields: ChangeField[];
};

export type RatTable = { rat: CellRat; rows: ChangeRow[] };

const PROTECTED_NEW_FIELDS: ReadonlySet<CellNumberField> = new Set(["lac", "cid", "rnc", "enbid", "gnbid", "clid"]);
const WHOLE_NUMBER = /^\d+$/;

export function getEditKey(index: number, field: CellNumberField): string {
  return `${index}:${field}`;
}

function readEdit(edits: FieldEdits, index: number, field: CellNumberField): string | undefined {
  return edits[getEditKey(index, field)];
}

function isValidNumber(text: string, max: number): boolean {
  if (!WHOLE_NUMBER.test(text)) return false;
  const value = Number(text);
  return value >= 0 && value <= max;
}

function isSameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findCell(record: StationRecord | undefined, cellId: number): StationCell | null {
  return record?.cells.find((cell) => cell.id === cellId) ?? null;
}

function findSectorAzimuth(record: StationRecord | undefined, sectorId: number | null | undefined): number | null {
  if (sectorId === null || sectorId === undefined) return null;
  return record?.sectors.find((sector) => sector.id === sectorId)?.azimuth ?? null;
}

function toChangeRow(item: CellApplyChange, index: number, record: StationRecord | undefined, edits: FieldEdits): ChangeRow | null {
  const before = item.action === "update" ? findCell(record, item.id) : null;
  const rat = item.action === "create" ? item.rat : (before?.rat ?? null);
  if (rat === null) return null;
  const changed: NumberedItem = item;
  const original: NumberedItem | null = before;
  const fields = RAT_FIELDS[rat].numbers.flatMap((spec): ChangeField[] => {
    const itemValue = readItemNumber(changed, spec.field);
    const storedValue = original === null ? null : readItemNumber(original, spec.field);
    const isChanged = item.action === "update" && spec.field in item;
    const value = item.action === "create" || isChanged ? itemValue : storedValue;
    if (item.action === "update" && !isChanged && storedValue === null) return [];
    const isEditable = item.action === "create" ? !PROTECTED_NEW_FIELDS.has(spec.field) : isChanged;
    const edit = isEditable ? readEdit(edits, index, spec.field) : undefined;
    const text = edit ?? (value === null ? "" : String(value));
    return [
      {
        field: spec.field,
        label: spec.label,
        value: text,
        was: isChanged ? storedValue : null,
        isEditable,
        isInvalid: edit !== undefined && !isValidNumber(edit.trim(), spec.max),
      },
    ];
  });
  const plmns = item.plmns ?? before?.plmns ?? [];
  const wasPlmns =
    item.action === "update" && item.plmns !== undefined && before !== null && !isSameList(before.plmns, item.plmns) ? before.plmns : null;
  const sectorId = item.action === "create" ? item.sectorId : (item.sectorId ?? before?.sectorId);

  return {
    index,
    isNew: item.action === "create",
    rat,
    bandId: item.bandId ?? before?.bandId ?? null,
    sectorAzimuth: findSectorAzimuth(record, sectorId),
    cellType: item.cellType ?? before?.cellType ?? null,
    plmns,
    wasPlmns,
    fields,
  };
}

export function listRatTables(items: readonly CellApplyChange[], record: StationRecord | undefined, edits: FieldEdits): RatTable[] {
  const rows = items.flatMap((item, index) => {
    const row = toChangeRow(item, index, record, edits);
    return row === null ? [] : [row];
  });
  return RAT_ORDER.flatMap((rat) => {
    const ratRows = rows.filter((row) => row.rat === rat);
    return ratRows.length === 0 ? [] : [{ rat, rows: ratRows }];
  });
}

export function hasInvalidEdit(tables: readonly RatTable[]): boolean {
  return tables.some((table) => table.rows.some((row) => row.fields.some((field) => field.isInvalid)));
}

export function applyEdits(items: readonly CellApplyChange[], edits: FieldEdits): CellApplyChange[] {
  return items.map((item, index) => {
    const changes = Object.fromEntries(
      Object.entries(edits).flatMap(([key, text]) => {
        const [itemIndex, field] = key.split(":");
        return Number(itemIndex) === index && field !== undefined ? [[field, Number(text.trim())]] : [];
      }),
    );
    return Object.keys(changes).length === 0 ? item : Object.assign({}, item, changes);
  });
}

function mergeUpdates(items: readonly CellApplyChange[]): CellApplyChange[] {
  const merged: CellApplyChange[] = [];
  for (const item of items) {
    const sameCell = item.action === "update" ? merged.findIndex((other) => other.action === "update" && other.id === item.id) : -1;
    const existing = merged[sameCell];
    if (existing === undefined) merged.push(item);
    else merged[sameCell] = Object.assign({}, existing, item);
  }
  return merged;
}

export function toCellApply(stationId: number, items: readonly CellApplyChange[], flagIds: readonly number[]): CellApply[] {
  return [{ stationId, cells: mergeUpdates(items), observationFlagIds: [...flagIds] }];
}
