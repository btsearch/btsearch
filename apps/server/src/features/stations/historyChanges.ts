import type { AuditOperationKind } from "@openbts/shared/audit";
import type {
  CellRat,
  Sector,
  StationHistoryAction,
  StationHistoryCell,
  StationHistoryChange,
  StationHistoryLocation,
  StationHistoryPhoto,
  StationHistoryValue,
} from "@openbts/shared/contract";

import { type ActiveRevertCoverage, getEntryRevertibility } from "../audit/revert/revertibility.js";
import type { AuditOperationRow } from "../audit/types.js";
import { RADIO_FIELD_NAMES } from "../cells/radioFields.js";
import { isStoredStructureType, toStructureType } from "../structures/serialize.js";
import {
  CELL_DETAIL_FIELDS,
  CELL_FIELDS,
  type HistoryObject,
  type SectorAzimuthsAsOf,
  azimuthList,
  baseAction,
  flattenCell,
  isPlainObject,
  mainPhotoId,
  movesCellSector,
  normalize,
  photoSelections,
  revertStatus,
} from "./history.js";
import type { AuditRow } from "./historyRows.js";
import { CELL_TYPES, CONTRACT_RATS, toAzimuth, toStationStatus } from "./serialize.js";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type ChangeBody = DistributiveOmit<StationHistoryChange, "revertStatus" | "isRevertible" | "entryIds">;
type StationChangeBody = Extract<ChangeBody, { kind: "station" }>;
type LocationChangeBody = Extract<ChangeBody, { kind: "location" }>;
type LocationField = LocationChangeBody["fields"][number]["field"];
type PhotosChangeBody = Extract<ChangeBody, { kind: "photos" }>;
type CellFieldChange = StationHistoryCell["fields"][number];
type CellValueField = Exclude<CellFieldChange["field"], "sector">;
type ValuePair = { from: StationHistoryValue; to: StationHistoryValue };
type SectorSide = keyof SectorAzimuthsAsOf;

export type HistoryContext = {
  locations: ReadonlyMap<number, StationHistoryLocation>;
  structureOwnerNames: ReadonlyMap<number, string>;
  photos: ReadonlyMap<number, StationHistoryPhoto>;
  unknownBandIds: ReadonlySet<number>;
  sectorAzimuths: SectorAzimuthsAsOf | undefined;
};

export type HistoryRevert = { canRevert: boolean; coverage: ActiveRevertCoverage | undefined };

const STATION_COLUMNS = [
  ["station_id", "siteId"],
  ["status", "status"],
  ["notes", "notes"],
  ["operator_id", "operatorId"],
  ["location_id", "location"],
  ["is_confirmed", "isConfirmed"],
] as const;
const LOCATION_COLUMNS = [
  ["region_id", "regionId"],
  ["city", "city"],
  ["address", "address"],
  ["longitude", "longitude"],
  ["latitude", "latitude"],
  ["structure_type", "structureType"],
  ["structure_owner_id", "structureOwner"],
  ["structure_note", "structureNote"],
] as const;
const IDENTIFIER_COLUMNS = [
  ["networks_id", "networksId"],
  ["networks_name", "networksName"],
  ["mno_name", "operatorName"],
] as const;
const BACKHAUL_COLUMNS = [
  ["type", "medium"],
  ["speed", "speedMbps"],
  ["model", "model"],
] as const;

const CELL_COLUMNS = [...CELL_FIELDS, "cell_type", ...CELL_DETAIL_FIELDS] as const;
const CELL_FIELD_NAMES: Readonly<Partial<Record<string, CellValueField>>> = {
  rat: "rat",
  band_id: "bandId",
  notes: "notes",
  is_confirmed: "isConfirmed",
  cell_type: "cellType",
  gnbid_length: "gnbidLength",
  ...RADIO_FIELD_NAMES.gsm,
  ...RADIO_FIELD_NAMES.umts,
  ...RADIO_FIELD_NAMES.lte,
  ...RADIO_FIELD_NAMES.nr,
};
const IDENTITY_COLUMNS: ReadonlySet<string> = new Set(["rat", "band_id"]);
const UNKNOWN_AS_ZERO: ReadonlySet<string> = new Set(["enbid", "gnbid", "rnc"]);

function toCellRat(value: unknown): CellRat | undefined {
  return value === "GSM" || value === "UMTS" || value === "LTE" || value === "NR" ? CONTRACT_RATS[value] : undefined;
}

function isStoredCellType(value: unknown): value is keyof typeof CELL_TYPES {
  return value === "MACROCELL" || value === "MICROCELL" || value === "PICOCELL" || value === "FEMTOCELL";
}

function changedPair(oldValues: HistoryObject | null, newValues: HistoryObject | null, column: string): ValuePair | null {
  const hasOld = oldValues !== null && column in oldValues;
  const hasNew = newValues !== null && column in newValues;
  if (!hasOld && !hasNew) return null;

  const from = normalize(oldValues?.[column]);
  const to = normalize(newValues?.[column]);
  return from === to ? null : { from, to };
}

function valueFields<F extends string>(
  oldValues: HistoryObject | null,
  newValues: HistoryObject | null,
  columns: readonly (readonly [string, F])[],
  translate: (value: StationHistoryValue) => StationHistoryValue = (value) => value,
): { field: F; from: StationHistoryValue; to: StationHistoryValue }[] {
  return columns.flatMap(([column, field]) => {
    const pair = changedPair(oldValues, newValues, column);
    if (pair === null) return [];
    const from = translate(pair.from);
    const to = translate(pair.to);
    return from === to ? [] : [{ field, from, to }];
  });
}

function locationRef(value: StationHistoryValue, context: HistoryContext): StationHistoryLocation | null {
  if (typeof value !== "number") return null;
  return context.locations.get(value) ?? { id: value, city: null, address: null };
}

function stationFields(oldValues: HistoryObject | null, newValues: HistoryObject | null, context: HistoryContext): StationChangeBody["fields"] {
  const fields: StationChangeBody["fields"] = [];
  for (const [column, field] of STATION_COLUMNS) {
    const pair = changedPair(oldValues, newValues, column);
    if (pair === null) continue;

    if (field === "location") fields.push({ field, from: locationRef(pair.from, context), to: locationRef(pair.to, context) });
    else if (field === "status") fields.push({ field, from: statusValue(pair.from), to: statusValue(pair.to) });
    else fields.push({ field, from: pair.from, to: pair.to });
  }
  return fields;
}

function statusValue(value: StationHistoryValue): StationHistoryValue {
  return value === "published" || value === "pending" || value === "inactive" ? toStationStatus(value) : value;
}

function locationValue(field: LocationField, value: StationHistoryValue, context: HistoryContext): StationHistoryValue {
  if (field === "structureType") return isStoredStructureType(value) ? toStructureType(value) : value;
  if (field === "structureOwner" && typeof value === "number") return context.structureOwnerNames.get(value) ?? value;
  return value;
}

function locationFields(oldValues: HistoryObject | null, newValues: HistoryObject | null, context: HistoryContext): LocationChangeBody["fields"] {
  return LOCATION_COLUMNS.flatMap(([column, field]) => {
    const pair = changedPair(oldValues, newValues, column);
    return pair === null ? [] : [{ field, from: locationValue(field, pair.from, context), to: locationValue(field, pair.to, context) }];
  });
}

function identifierValue(value: StationHistoryValue): StationHistoryValue {
  return typeof value === "number" ? String(value) : value;
}

function sectorsField(oldValues: unknown, newValues: unknown) {
  const from = azimuthList(oldValues);
  const to = azimuthList(newValues);
  if (from.length === to.length && from.every((azimuth, index) => azimuth === to[index])) return null;
  return { field: "azimuths" as const, from: from.map(toAzimuth), to: to.map(toAzimuth) };
}

function cellFieldName(column: string, rat: CellRat): CellValueField | null {
  if (column === "arfcn") return rat === "umts" || rat === "nr" ? RADIO_FIELD_NAMES[rat].arfcn : null;
  return CELL_FIELD_NAMES[column] ?? null;
}

function cellValue(column: string, value: StationHistoryValue, flat: HistoryObject, context: HistoryContext): StationHistoryValue {
  if (column === "rat") return toCellRat(value) ?? value;
  if (column === "cell_type") return isStoredCellType(value) ? CELL_TYPES[value] : value;
  if (column === "band_id") return typeof value === "number" && context.unknownBandIds.has(value) ? null : value;
  if (UNKNOWN_AS_ZERO.has(column)) return value === 0 ? null : value;
  if (column === "cid" && flat.rat === "UMTS" && flat.rnc === 0) return value === 0 ? null : value;
  if (column === "clid" && flat.rat === "LTE" && flat.enbid === 0) return value === 0 ? null : value;
  return value;
}

function sectorRef(value: StationHistoryValue, side: SectorSide, context: HistoryContext): Sector | null {
  if (typeof value !== "number") return null;
  const azimuth = context.sectorAzimuths?.[side].get(value);
  return { id: value, azimuth: azimuth === undefined ? null : toAzimuth(azimuth) };
}

function updatedCellFields(oldFlat: HistoryObject, newFlat: HistoryObject, rat: CellRat, context: HistoryContext): CellFieldChange[] {
  return CELL_COLUMNS.flatMap((column): CellFieldChange[] => {
    if (!(column in oldFlat) || !(column in newFlat)) return [];
    const pair = changedPair(oldFlat, newFlat, column);
    if (pair === null) return [];

    if (column === "sector_id") {
      const from = sectorRef(pair.from, "before", context);
      const to = sectorRef(pair.to, "after", context);
      const areBothKnown = context.sectorAzimuths?.before.has(Number(pair.from)) && context.sectorAzimuths.after.has(Number(pair.to));
      return areBothKnown && from?.azimuth === to?.azimuth ? [] : [{ field: "sector", from, to }];
    }

    const field = cellFieldName(column, rat);
    if (field === null) return [];
    const from = cellValue(column, pair.from, oldFlat, context);
    const to = cellValue(column, pair.to, newFlat, context);
    return from === to ? [] : [{ field, from, to }];
  });
}

function snapshotCellFields(flat: HistoryObject, action: StationHistoryAction, rat: CellRat, context: HistoryContext): CellFieldChange[] {
  const isCreate = action === "create";
  return CELL_COLUMNS.flatMap((column): CellFieldChange[] => {
    if (IDENTITY_COLUMNS.has(column)) return [];
    const raw = normalize(flat[column]);
    if (raw === null) return [];

    if (column === "sector_id") {
      const sector = sectorRef(raw, isCreate ? "after" : "before", context);
      return [{ field: "sector", from: isCreate ? null : sector, to: isCreate ? sector : null }];
    }

    const field = cellFieldName(column, rat);
    const value = cellValue(column, raw, flat, context);
    if (field === null || value === null) return [];
    return [{ field, from: isCreate ? null : value, to: isCreate ? value : null }];
  });
}

function cellNumber(column: string, flat: HistoryObject, context: HistoryContext): number | null {
  const value = cellValue(column, normalize(flat[column]), flat, context);
  return typeof value === "number" ? value : null;
}

function cellChange(row: AuditRow, action: StationHistoryAction, context: HistoryContext): StationHistoryCell | null {
  const id = Number(row.record_id);
  const oldFlat = flattenCell(row.old_values);
  const newFlat = flattenCell(row.new_values);
  const identity = action === "create" ? newFlat : oldFlat;
  const rat = toCellRat(identity?.rat);
  if (!Number.isSafeInteger(id) || id <= 0 || identity === null || rat === undefined) return null;

  let fields: CellFieldChange[];
  if (action !== "update") fields = snapshotCellFields(identity, action, rat, context);
  else if (oldFlat !== null && newFlat !== null) fields = updatedCellFields(oldFlat, newFlat, rat, context);
  else fields = [];
  if (fields.length === 0) return null;

  const hasCid = rat === "gsm" || rat === "umts";
  return {
    id,
    rat,
    bandId: cellNumber("band_id", identity, context),
    cid: hasCid ? cellNumber("cid", identity, context) : null,
    clid: hasCid ? null : cellNumber("clid", identity, context),
    fields,
  };
}

function photoDiff(row: AuditRow) {
  const previous = photoSelections(row.old_values);
  const next = photoSelections(row.new_values);
  return {
    addedIds: [...next.keys()].filter((photoId) => !previous.has(photoId)).sort((left, right) => left - right),
    removedIds: [...previous.keys()].filter((photoId) => !next.has(photoId)).sort((left, right) => left - right),
    previousMainId: mainPhotoId(previous),
    nextMainId: mainPhotoId(next),
  };
}

function photoRef(photoId: number, context: HistoryContext): StationHistoryPhoto {
  return context.photos.get(photoId) ?? { id: null, urls: null };
}

function mainPhotoRef(photoId: number | null, context: HistoryContext): StationHistoryPhoto | null {
  return photoId === null ? null : photoRef(photoId, context);
}

function photosChange(row: AuditRow, context: HistoryContext): PhotosChangeBody | null {
  const { addedIds, removedIds, previousMainId, nextMainId } = photoDiff(row);
  const isMainChanged = previousMainId !== nextMainId;
  if (addedIds.length === 0 && removedIds.length === 0 && !isMainChanged) return null;

  let action: StationHistoryAction = "update";
  if (addedIds.length > 0 && removedIds.length === 0) action = "create";
  if (addedIds.length === 0 && removedIds.length > 0) action = "delete";
  return {
    kind: "photos",
    action,
    added: addedIds.map((photoId) => photoRef(photoId, context)),
    removed: removedIds.map((photoId) => photoRef(photoId, context)),
    main: isMainChanged ? { from: mainPhotoRef(previousMainId, context), to: mainPhotoRef(nextMainId, context) } : null,
  };
}

function objectOrNull(value: unknown): HistoryObject | null {
  return isPlainObject(value) ? value : null;
}

function changeBody(row: AuditRow, operationKind: AuditOperationKind, context: HistoryContext): ChangeBody | null {
  const oldValues = objectOrNull(row.old_values);
  const newValues = objectOrNull(row.new_values);
  const action = baseAction(row, operationKind);

  switch (row.entity) {
    case "stations": {
      const fields = stationFields(oldValues, newValues, context);
      return fields.length === 0 ? null : { kind: "station", action, fields };
    }
    case "locations": {
      const fields = locationFields(oldValues, newValues, context);
      return fields.length === 0 ? null : { kind: "location", action, fields };
    }
    case "extra_identificators": {
      const fields = valueFields(oldValues, newValues, IDENTIFIER_COLUMNS, identifierValue);
      return fields.length === 0 ? null : { kind: "identifiers", action, fields };
    }
    case "station_uplinks": {
      const fields = valueFields(oldValues, newValues, BACKHAUL_COLUMNS);
      return fields.length === 0 ? null : { kind: "backhaul", action, fields };
    }
    case "station_sectors": {
      const field = sectorsField(row.old_values, row.new_values);
      return field === null ? null : { kind: "sectors", action: "update", fields: [field] };
    }
    case "cells": {
      const cell = cellChange(row, action, context);
      return cell === null ? null : { kind: "cells", action, cells: [cell] };
    }
    case "station_photo_selections":
      return photosChange(row, context);
    default:
      return null;
  }
}

function changedIds(row: AuditRow, column: string): number[] {
  const pair = changedPair(objectOrNull(row.old_values), objectOrNull(row.new_values), column);
  return [pair?.from, pair?.to].filter((value): value is number => typeof value === "number");
}

export function locationChangeIds(row: AuditRow): number[] {
  if (row.entity !== "stations") return [];
  return changedIds(row, "location_id");
}

export function structureOwnerChangeIds(row: AuditRow): number[] {
  if (row.entity !== "locations") return [];
  return changedIds(row, "structure_owner_id");
}

export function photoChangeIds(row: AuditRow): number[] {
  if (row.entity !== "station_photo_selections") return [];
  const { addedIds, removedIds, previousMainId, nextMainId } = photoDiff(row);
  const mainIds = previousMainId === nextMainId ? [] : [previousMainId, nextMainId];
  return [...addedIds, ...removedIds, ...mainIds].filter((photoId): photoId is number => photoId !== null);
}

export function operationChanges(
  entries: readonly AuditRow[],
  operation: AuditOperationRow,
  context: HistoryContext,
  revert: HistoryRevert,
): StationHistoryChange[] {
  const drafts: { body: ChangeBody; entryIds: number[]; isRevertible: boolean }[] = [];
  const hiddenSectorMoveIds: number[] = [];
  const revertedEntryIds = revert.coverage?.revertedEntryIds ?? new Set<number>();

  for (const entry of entries) {
    const body = changeBody(entry, operation.kind, context);
    if (body === null) {
      if (movesCellSector(entry)) hiddenSectorMoveIds.push(entry.id);
      continue;
    }

    const isRevertible = getEntryRevertibility({ ...entry, metadata: objectOrNull(entry.metadata) }, { operation, revertedEntryIds }).revertible;
    if (body.kind === "cells") {
      const merged = drafts.find((draft) => draft.body.kind === "cells" && draft.body.action === body.action);
      if (merged?.body.kind === "cells") {
        merged.body.cells.push(...body.cells);
        merged.entryIds.push(entry.id);
        merged.isRevertible ||= isRevertible;
        continue;
      }
    }
    drafts.push({ body, entryIds: [entry.id], isRevertible });
  }
  drafts.find((draft) => draft.body.kind === "sectors")?.entryIds.push(...hiddenSectorMoveIds);

  return drafts.map(({ body, entryIds, isRevertible }) => ({
    ...body,
    revertStatus: revertStatus(entryIds, operation, revert.coverage),
    isRevertible: revert.canRevert && isRevertible,
    entryIds: revert.canRevert ? entryIds : [],
  }));
}
