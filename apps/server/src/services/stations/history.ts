import type { auditLogs } from "@openbts/drizzle";

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

export type StationHistoryEntry = {
  id: number;
  kind: "station" | "location" | "cells" | "sectors" | "network_ids" | "photos";
  action: "create" | "update" | "delete";
  createdAt: Date;
  changes: StationHistoryChange[];
  author?: StationHistoryAuthor | null;
};

export type StationHistoryLookups = {
  bands: ReadonlyMap<number, string>;
  operators: ReadonlyMap<number, string>;
  regions: ReadonlyMap<number, string>;
  locations: ReadonlyMap<number, string>;
  sectorAzimuths: ReadonlyMap<number, number>;
};

type AuditRow = typeof auditLogs.$inferSelect;
type HistoryObject = Record<string, unknown>;

const STATION_FIELDS = ["station_id", "status", "notes", "extra_address", "operator_id", "location_id", "is_confirmed"] as const;
const LOCATION_FIELDS = ["region_id", "city", "address", "longitude", "latitude"] as const;
const EXTRA_IDENTIFIER_FIELDS = ["networks_id", "networks_name", "mno_name"] as const;
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

function resolveValue(key: string, value: StationHistoryValue, lookups: StationHistoryLookups): StationHistoryValue {
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
      return lookups.sectorAzimuths.get(value) ?? `#${value}`;
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
    const change: StationHistoryChange = {
      field: presentField(key),
      from: resolveValue(key, fromValue, lookups),
      to: resolveValue(key, toValue, lookups),
    };
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

function cellSnapshot(flat: HistoryObject, lookups: StationHistoryLookups): Record<string, StationHistoryValue> {
  const snapshot: Record<string, StationHistoryValue> = {};
  for (const [key, raw] of Object.entries(flat)) {
    const value = normalize(raw);
    if (value === null) continue;
    snapshot[presentField(key)] = resolveValue(key, value, lookups);
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

function extractCellList(values: unknown): HistoryObject[] {
  if (isPlainObject(values) && Array.isArray(values.cells)) return values.cells.filter(isPlainObject);
  if (isPlainObject(values)) return [values];
  return [];
}

function transformCells(row: AuditRow, action: StationHistoryEntry["action"], lookups: StationHistoryLookups): StationHistoryChange[] {
  const changes: StationHistoryChange[] = [];
  if (action === "create" || action === "delete") {
    const source = action === "create" ? row.new_values : row.old_values;
    for (const cell of extractCellList(source)) {
      const flat = flattenCell(cell);
      if (!flat) continue;
      const snapshot = cellSnapshot(flat, lookups);
      const change: StationHistoryChange = {
        field: "cell",
        from: action === "create" ? null : snapshot,
        to: action === "create" ? snapshot : null,
      };
      const label = cellLabel(flat, lookups);
      if (label) change.label = label;
      if (typeof flat.rat === "string") change.rat = flat.rat;
      changes.push(change);
    }
    return changes;
  }

  const oldCells = extractCellList(row.old_values).map(flattenCell);
  const newCells = extractCellList(row.new_values).map(flattenCell);
  const pairCount = Math.min(oldCells.length, newCells.length);
  for (let index = 0; index < pairCount; index++) {
    const oldFlat = oldCells[index];
    const newFlat = newCells[index];
    if (!oldFlat || !newFlat) continue;
    const baseLabel = cellLabel(newFlat, lookups) ?? cellLabel(oldFlat, lookups);
    const identifier = cellIdentifier(oldFlat) ?? cellIdentifier(newFlat);
    const label = baseLabel !== undefined && identifier !== undefined ? `${baseLabel} · ${identifier}` : (baseLabel ?? identifier);
    const ratValue = newFlat.rat ?? oldFlat.rat;
    changes.push(
      ...diffFields(oldFlat, newFlat, [...CELL_FIELDS, "cell_type", ...CELL_DETAIL_FIELDS], lookups, {
        requireBothSides: true,
        label,
        rat: typeof ratValue === "string" ? ratValue : undefined,
      }),
    );
  }
  return changes;
}

function azimuthList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlainObject)
    .map((sector) => sector.azimuth)
    .filter((azimuth): azimuth is number => typeof azimuth === "number")
    .sort((a, b) => a - b);
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

function transformPhotos(row: AuditRow): { action: StationHistoryEntry["action"]; changes: StationHistoryChange[] } {
  const previous = photoSelections(row.old_values);
  const next = photoSelections(row.new_values);
  const addedIds = [...next.keys()].filter((photoId) => !previous.has(photoId)).sort((a, b) => a - b);
  const deletedIds = [...previous.keys()].filter((photoId) => !next.has(photoId)).sort((a, b) => a - b);
  const previousMainId = mainPhotoId(previous);
  const nextMainId = mainPhotoId(next);
  const changes: StationHistoryChange[] = [
    ...deletedIds.map((photoId) => ({ field: "photo", from: `#${photoId}`, to: null })),
    ...addedIds.map((photoId) => ({ field: "photo", from: null, to: `#${photoId}` })),
    ...(previousMainId === nextMainId ? [] : [{ field: "main_photo", from: photoReference(previousMainId), to: photoReference(nextMainId) }]),
  ];
  const action = addedIds.length > 0 && deletedIds.length === 0 ? "create" : addedIds.length === 0 && deletedIds.length > 0 ? "delete" : "update";
  return { action, changes };
}

export function enrichSectorAzimuths(map: Map<number, number>, rows: AuditRow[]): void {
  for (const row of rows) {
    if (row.table_name !== "station_sectors") continue;
    for (const values of [row.new_values, row.old_values]) {
      if (!Array.isArray(values)) continue;
      for (const sector of values) {
        if (!isPlainObject(sector)) continue;
        if (typeof sector.id === "number" && typeof sector.azimuth === "number" && !map.has(sector.id)) map.set(sector.id, sector.azimuth);
      }
    }
  }
}

export function collectLocationSnapshotNames(map: Map<number, string>, rows: AuditRow[]): void {
  for (const row of rows) {
    if (row.table_name !== "locations" || row.record_id === null || map.has(row.record_id)) continue;
    for (const values of [row.old_values, row.new_values]) {
      if (!isPlainObject(values)) continue;
      const name = [values.city, values.address].filter((part): part is string => typeof part === "string" && part !== "").join(", ");
      if (name !== "") {
        map.set(row.record_id, name);
        break;
      }
    }
  }
}

function baseAction(row: AuditRow): StationHistoryEntry["action"] {
  if (row.action.endsWith(".create")) return "create";
  if (row.action.endsWith(".delete")) return "delete";
  return "update";
}

export function transformAuditRow(row: AuditRow, lookups: StationHistoryLookups): StationHistoryEntry | null {
  const oldValues = isPlainObject(row.old_values) ? row.old_values : null;
  const newValues = isPlainObject(row.new_values) ? row.new_values : null;
  let action = baseAction(row);
  let kind: StationHistoryEntry["kind"];
  let changes: StationHistoryChange[];

  switch (row.table_name) {
    case "stations":
      kind = "station";
      changes = diffFields(oldValues, newValues, STATION_FIELDS, lookups);
      break;
    case "locations":
      kind = "location";
      changes = diffFields(oldValues, newValues, LOCATION_FIELDS, lookups);
      break;
    case "extra_identificators": {
      kind = "network_ids";
      action = oldValues === null ? "create" : newValues === null ? "delete" : "update";
      changes = diffFields(oldValues, newValues, EXTRA_IDENTIFIER_FIELDS, lookups);
      break;
    }
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
  return { id: row.id, kind, action, createdAt: row.createdAt, changes };
}
