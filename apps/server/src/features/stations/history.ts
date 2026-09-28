import type { auditLogs } from "@openbts/drizzle";
import type { AuditOperationKind } from "@openbts/shared/audit";

export type StationHistoryValue = string | number | boolean | null;
export type StationHistoryChangeValue = StationHistoryValue | StationHistoryValue[] | Record<string, StationHistoryValue>;

export type StationHistoryChange = {
  field: string;
  from: StationHistoryChangeValue;
  to: StationHistoryChangeValue;
  label?: string;
  rat?: string;
};

export type StationHistoryAuthor = {
  id: string;
  name: string | null;
  username: string;
  image: string | null;
};

export type StationHistorySection = {
  kind: "station" | "location" | "cells" | "sectors" | "network_ids" | "uplink" | "photos";
  action: "create" | "update" | "delete";
  changes: StationHistoryChange[];
};

export type SectorAzimuthsAsOf = { before: ReadonlyMap<number, number>; after: ReadonlyMap<number, number> };

export type StationHistoryLookups = {
  bands: ReadonlyMap<number, string>;
  operators: ReadonlyMap<number, string>;
  regions: ReadonlyMap<number, string>;
  locations: ReadonlyMap<number, string>;
  sectorAzimuths?: SectorAzimuthsAsOf;
};

type AuditRow = typeof auditLogs.$inferSelect;
type HistoryObject = Record<string, unknown>;
type SectorSide = keyof SectorAzimuthsAsOf;

const STATION_FIELDS = ["station_id", "status", "notes", "extra_address", "operator_id", "location_id", "is_confirmed"] as const;
const LOCATION_FIELDS = ["region_id", "city", "address", "longitude", "latitude"] as const;
const EXTRA_IDENTIFIER_FIELDS = ["networks_id", "networks_name", "mno_name"] as const;
const UPLINK_FIELDS = ["type", "speed", "model"] as const;
const CELL_FIELDS = ["rat", "band_id", "sector_id", "notes", "is_confirmed"] as const;
const CELL_DETAIL_FIELDS = [
  "lac",
  "cid",
  "e_gsm",
  "rnc",
  "arfcn",
  "tac",
  "enbid",
  "clid",
  "pci",
  "earfcn",
  "supports_iot",
  "nrtac",
  "gnbid",
  "gnbid_length",
  "type",
  "supports_nr_redcap",
] as const;

function isPlainObject(value: unknown): value is HistoryObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(value: unknown): StationHistoryValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function presentField(key: string): string {
  switch (key) {
    case "operator_id":
      return "operator";
    case "location_id":
      return "location";
    case "region_id":
      return "region";
    case "band_id":
      return "band";
    case "sector_id":
      return "azimuth";
    case "is_confirmed":
      return "confirmed";
    default:
      return key;
  }
}

function resolveValue(key: string, value: StationHistoryValue, lookups: StationHistoryLookups, side: SectorSide): StationHistoryValue {
  if (typeof value !== "number") return value;
  switch (key) {
    case "operator_id":
      return lookups.operators.get(value) ?? value;
    case "location_id":
      return lookups.locations.get(value) ?? `#${value}`;
    case "region_id":
      return lookups.regions.get(value) ?? value;
    case "band_id":
      return lookups.bands.get(value) ?? value;
    case "sector_id":
      return lookups.sectorAzimuths?.[side].get(value) ?? `#${value}`;
    default:
      return value;
  }
}

function diffFields(
  oldValues: HistoryObject | null,
  newValues: HistoryObject | null,
  fields: readonly string[],
  lookups: StationHistoryLookups,
  options?: { requireBothSides?: boolean; label?: string; rat?: string },
): StationHistoryChange[] {
  const changes: StationHistoryChange[] = [];
  for (const key of fields) {
    const hasOld = oldValues !== null && key in oldValues;
    const hasNew = newValues !== null && key in newValues;
    if (!hasOld && !hasNew) continue;
    if (options?.requireBothSides && (!hasOld || !hasNew)) continue;
    const fromValue = normalize(oldValues?.[key]);
    const toValue = normalize(newValues?.[key]);
    if (fromValue === toValue) continue;
    const from = resolveValue(key, fromValue, lookups, "before");
    const to = resolveValue(key, toValue, lookups, "after");
    if (key === "sector_id" && from === to) continue;
    const change: StationHistoryChange = { field: presentField(key), from, to };
    if (options?.label) change.label = options.label;
    if (options?.rat) change.rat = options.rat;
    changes.push(change);
  }
  return changes;
}

function flattenCell(value: unknown): HistoryObject | null {
  if (!isPlainObject(value)) return null;
  const flat: HistoryObject = {};
  for (const key of CELL_FIELDS) if (key in value) flat[key] = value[key];
  if ("type" in value) flat.cell_type = value.type ?? null;
  const details = [value.details, value.gsm, value.umts, value.lte, value.nr].find(isPlainObject) ?? null;
  if (details) for (const key of CELL_DETAIL_FIELDS) if (key in details) flat[key] = details[key];
  return flat;
}

function cellSnapshot(flat: HistoryObject, lookups: StationHistoryLookups, side: SectorSide): Record<string, StationHistoryValue> {
  const snapshot: Record<string, StationHistoryValue> = {};
  for (const [key, raw] of Object.entries(flat)) {
    const value = normalize(raw);
    if (value === null) continue;
    snapshot[presentField(key)] = resolveValue(key, value, lookups, side);
  }
  return snapshot;
}

function cellLabel(flat: HistoryObject, lookups: StationHistoryLookups): string | undefined {
  const rat = typeof flat.rat === "string" ? flat.rat : null;
  const band = typeof flat.band_id === "number" ? (lookups.bands.get(flat.band_id) ?? null) : null;
  if (rat !== null && band !== null && band.toUpperCase().includes(rat.toUpperCase())) return band;
  const label = [rat, band].filter(Boolean).join(" ");
  return label === "" ? undefined : label;
}

function cellIdentifier(flat: HistoryObject): string | undefined {
  const rat = typeof flat.rat === "string" ? flat.rat : null;
  if ((rat === "LTE" || rat === "NR") && typeof flat.clid === "number") return `CLID ${flat.clid}`;
  if ((rat === "GSM" || rat === "UMTS") && typeof flat.cid === "number") return `CID ${flat.cid}`;
  return undefined;
}

function transformCells(row: AuditRow, action: StationHistorySection["action"], lookups: StationHistoryLookups): StationHistoryChange[] {
  if (action === "create" || action === "delete") {
    const flat = flattenCell(action === "create" ? row.new_values : row.old_values);
    if (!flat) return [];
    const snapshot = cellSnapshot(flat, lookups, action === "create" ? "after" : "before");
    const change: StationHistoryChange = {
      field: "cell",
      from: action === "create" ? null : snapshot,
      to: action === "create" ? snapshot : null,
    };
    const label = cellLabel(flat, lookups);
    if (label) change.label = label;
    if (typeof flat.rat === "string") change.rat = flat.rat;
    return [change];
  }

  const oldFlat = flattenCell(row.old_values);
  const newFlat = flattenCell(row.new_values);
  if (!oldFlat || !newFlat) return [];
  const baseLabel = cellLabel(newFlat, lookups) ?? cellLabel(oldFlat, lookups);
  const identifier = cellIdentifier(oldFlat) ?? cellIdentifier(newFlat);
  const label = baseLabel !== undefined && identifier !== undefined ? `${baseLabel} · ${identifier}` : (baseLabel ?? identifier);
  const ratValue = newFlat.rat ?? oldFlat.rat;
  return diffFields(oldFlat, newFlat, [...CELL_FIELDS, "cell_type", ...CELL_DETAIL_FIELDS], lookups, {
    requireBothSides: true,
    label,
    rat: typeof ratValue === "string" ? ratValue : undefined,
  });
}

function sectorAzimuthMap(value: unknown): Map<number, number> {
  const azimuths = new Map<number, number>();
  if (!Array.isArray(value)) return azimuths;
  for (const sector of value)
    if (isPlainObject(sector) && typeof sector.id === "number" && typeof sector.azimuth === "number") azimuths.set(sector.id, sector.azimuth);
  return azimuths;
}

function azimuthList(value: unknown): number[] {
  return [...sectorAzimuthMap(value)].sort(([leftId], [rightId]) => leftId - rightId).map(([, azimuth]) => azimuth);
}

function photoSelections(value: unknown): Map<number, boolean> {
  const selections = new Map<number, boolean>();
  if (!Array.isArray(value)) return selections;

  for (const selection of value) {
    if (!isPlainObject(selection)) continue;
    const photoId = selection.location_photo_id;
    if (typeof photoId !== "number") continue;
    selections.set(photoId, selection.is_main === true);
  }

  return selections;
}

function mainPhotoId(selections: ReadonlyMap<number, boolean>): number | null {
  let result: number | null = null;
  for (const [photoId, isMain] of selections) {
    if (isMain && (result === null || photoId < result)) result = photoId;
  }
  return result;
}

function photoReference(photoId: number | null): string | null {
  return photoId === null ? null : `#${photoId}`;
}

function transformPhotos(row: AuditRow): { action: StationHistorySection["action"]; changes: StationHistoryChange[] } {
  const previous = photoSelections(row.old_values);
  const next = photoSelections(row.new_values);
  const addedIds = [...next.keys()].filter((photoId) => !previous.has(photoId)).sort((a, b) => a - b);
  const deletedIds = [...previous.keys()].filter((photoId) => !next.has(photoId)).sort((a, b) => a - b);
  const previousMainId = mainPhotoId(previous);
  const nextMainId = mainPhotoId(next);
  const changes: StationHistoryChange[] = [
    ...deletedIds.map((photoId) => ({ field: "photo", from: `#${photoId}`, to: null })),
    ...addedIds.map((photoId) => ({ field: "photo", from: null, to: `#${photoId}` })),
  ];
  if (changes.length > 0 && previousMainId !== nextMainId)
    changes.push({ field: "main_photo", from: photoReference(previousMainId), to: photoReference(nextMainId) });

  let action: StationHistorySection["action"] = "update";
  if (addedIds.length > 0 && deletedIds.length === 0) action = "create";
  if (addedIds.length === 0 && deletedIds.length > 0) action = "delete";
  return { action, changes };
}

export function groupRowsByOperation(rows: readonly AuditRow[]): Map<number, AuditRow[]> {
  const rowsByOperation = new Map<number, AuditRow[]>();
  for (const row of rows) {
    const operationRows = rowsByOperation.get(row.operation_id) ?? [];
    operationRows.push(row);
    rowsByOperation.set(row.operation_id, operationRows);
  }
  return rowsByOperation;
}

export function sectorAzimuthsByOperation(
  liveAzimuths: ReadonlyMap<number, number>,
  sectorRows: readonly AuditRow[],
  operationIds: readonly number[],
): Map<number, SectorAzimuthsAsOf> {
  const rowsByOperation = groupRowsByOperation(sectorRows);
  const azimuthsByOperation = new Map<number, SectorAzimuthsAsOf>();
  let current = liveAzimuths;
  const newestFirst = [...new Set([...operationIds, ...rowsByOperation.keys()])].sort((left, right) => right - left);
  for (const operationId of newestFirst) {
    const rows = (rowsByOperation.get(operationId) ?? []).sort((left, right) => left.id - right.id);
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (!first || !last) {
      azimuthsByOperation.set(operationId, { before: current, after: current });
      continue;
    }
    const before = sectorAzimuthMap(first.old_values);
    azimuthsByOperation.set(operationId, { before, after: sectorAzimuthMap(last.new_values) });
    current = before;
  }
  return azimuthsByOperation;
}

export function movesCellSector(row: AuditRow): boolean {
  if (row.entity !== "cells" || row.op !== "update" || !isPlainObject(row.old_values) || !isPlainObject(row.new_values)) return false;
  return normalize(row.old_values.sector_id) !== normalize(row.new_values.sector_id);
}

export function collectLocationSnapshotNames(map: Map<number, string>, rows: AuditRow[]): void {
  for (const row of rows) {
    if (row.entity !== "locations" || row.record_id === null) continue;
    const locationId = Number(row.record_id);
    if (!Number.isInteger(locationId) || map.has(locationId)) continue;
    for (const values of [row.old_values, row.new_values]) {
      if (!isPlainObject(values)) continue;
      const name = [values.city, values.address].filter((part): part is string => typeof part === "string" && part !== "").join(", ");
      if (name !== "") {
        map.set(locationId, name);
        break;
      }
    }
  }
}

function baseAction(row: AuditRow, operationKind: AuditOperationKind): StationHistorySection["action"] {
  if (row.entity === "stations" && operationKind === "station.delete") return "delete";
  return row.op;
}

export function transformEntry(row: AuditRow, operationKind: AuditOperationKind, lookups: StationHistoryLookups): StationHistorySection | null {
  const oldValues = isPlainObject(row.old_values) ? row.old_values : null;
  const newValues = isPlainObject(row.new_values) ? row.new_values : null;
  let action = baseAction(row, operationKind);
  let kind: StationHistorySection["kind"];
  let changes: StationHistoryChange[];

  switch (row.entity) {
    case "stations":
      kind = "station";
      changes = diffFields(oldValues, newValues, STATION_FIELDS, lookups);
      break;
    case "locations":
      kind = "location";
      changes = diffFields(oldValues, newValues, LOCATION_FIELDS, lookups);
      break;
    case "extra_identificators":
      kind = "network_ids";
      changes = diffFields(oldValues, newValues, EXTRA_IDENTIFIER_FIELDS, lookups);
      break;
    case "station_uplinks":
      kind = "uplink";
      changes = diffFields(oldValues, newValues, UPLINK_FIELDS, lookups).map((change) => ({ ...change, field: `uplink_${change.field}` }));
      break;
    case "station_sectors": {
      kind = "sectors";
      action = "update";
      const fromValue = azimuthList(row.old_values);
      const toValue = azimuthList(row.new_values);
      const unchanged = fromValue.length === toValue.length && fromValue.every((azimuth, index) => azimuth === toValue[index]);
      changes = unchanged ? [] : [{ field: "azimuths", from: fromValue, to: toValue }];
      break;
    }
    case "cells":
      kind = "cells";
      changes = transformCells(row, action, lookups);
      break;
    case "station_photo_selections": {
      kind = "photos";
      const photoChanges = transformPhotos(row);
      action = photoChanges.action;
      changes = photoChanges.changes;
      break;
    }
    default:
      return null;
  }

  if (changes.length === 0) return null;
  return { kind, action, changes };
}
