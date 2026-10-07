import type { Cell, CellDifference, NrIdentity, ObservedCell, Station } from "@openbts/shared/contract";

import type { AnalyzerSession } from "../data/session";
import { ANALYZER_RATS, DIFFERENCE_FIELDS } from "./filters";
import { findStoredCell } from "./rows";
import { type AnalyzerSearch, parseAnalyzerSearch } from "./search";
import type { LogFormat, RowFacts, TickAction } from "./types";

export type DraftStation = {
  id: number;
  siteId: string;
  operatorId: number | null;
  place: {
    locationId: number;
    countryCode: string;
    regionId: number;
    city: string | null;
    address: string | null;
    latitude: number;
    longitude: number;
  } | null;
};

export type DraftRow = {
  index: number;
  description: string;
  observed: ObservedCell;
  action: TickAction;
  stationId: number;
  cellId: number | null;
  stored: Cell | null;
  differences: CellDifference[];
  nrIdentity: NrIdentity | null;
  bandId: number | null;
};

export type AnalyzerDraft = {
  id: string;
  createdAt: string;
  file: { name: string; format: LogFormat; rowCount: number; analyzedAt: string };
  returnSearch: AnalyzerSearch;
  stations: DraftStation[];
  rows: DraftRow[];
};

export type DraftInput = { session: AnalyzerSession; facts: readonly RowFacts[]; search: AnalyzerSearch };

type UnknownRecord = Record<string, unknown>;

const DRAFT_ACTIONS: readonly string[] = ["update", "create", "confirm"] satisfies readonly TickAction[];
const DRAFT_FORMATS: readonly string[] = ["ntm", "netmonitor", "nsg"] satisfies readonly LogFormat[];
const DRAFT_RATS: readonly string[] = ANALYZER_RATS;
const DRAFT_DIFFERENCE_FIELDS: readonly string[] = DIFFERENCE_FIELDS;
const DRAFT_PLMN_PATTERN = /^\d{5,6}$/;
const UNNAMED_FILE = "";
const FALLBACK_FORMAT: LogFormat = "ntm";

function toDraftStation(station: Station): DraftStation {
  const location = station.location ?? null;

  return {
    id: station.id,
    siteId: station.siteId,
    operatorId: station.operatorId,
    place:
      location === null
        ? null
        : {
            locationId: location.id,
            countryCode: location.countryCode,
            regionId: location.regionId,
            city: location.city,
            address: location.address,
            latitude: location.latitude,
            longitude: location.longitude,
          },
  };
}

function toDraftRow(index: number, { session, facts }: DraftInput): DraftRow | null {
  const row = session.rows[index];
  const result = session.results?.[index] ?? null;
  const tick = facts[index]?.tick;
  if (row === undefined || result === null || result.stationId === null || tick === undefined || !tick.canTick) return null;

  const base = {
    index,
    description: row.description,
    observed: row.observed,
    action: tick.action,
    stationId: result.stationId,
    nrIdentity: result.nrIdentity,
  };
  if (tick.action === "create") return { ...base, cellId: null, stored: null, differences: [], bandId: facts[index].bandId };

  const stored = findStoredCell(result, session.tables);
  if (stored === undefined) return null;
  return { ...base, cellId: stored.id, stored, differences: tick.action === "update" ? result.differences : [], bandId: stored.bandId };
}

export function buildAnalyzerDraft(input: DraftInput): Omit<AnalyzerDraft, "id" | "createdAt"> {
  const { session } = input;
  const stations = new Map<number, DraftStation>();
  const rows: DraftRow[] = [];

  for (const index of [...session.selected].sort((left, right) => left - right)) {
    const row = toDraftRow(index, input);
    const station = row === null ? undefined : session.tables.stationsById.get(row.stationId);
    if (row === null || station === undefined) continue;

    if (!stations.has(station.id)) stations.set(station.id, toDraftStation(station));
    rows.push(row);
  }

  return {
    file: {
      name: session.file?.name ?? UNNAMED_FILE,
      format: session.file?.format ?? FALLBACK_FORMAT,
      rowCount: session.rows.length,
      analyzedAt: new Date(session.analyzedAt ?? Date.now()).toISOString(),
    },
    returnSearch: input.search,
    stations: [...stations.values()],
    rows,
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isIntegerOrNull(value: unknown): boolean {
  return value === null || isInteger(value);
}

function isTextOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isDate(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isDraftFile(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && DRAFT_FORMATS.includes(String(value.format)) && isInteger(value.rowCount) && isDate(value.analyzedAt);
}

function isDraftPlace(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value) || !isInteger(value.locationId) || typeof value.countryCode !== "string" || !isInteger(value.regionId)) return false;
  return isTextOrNull(value.city) && isTextOrNull(value.address) && Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
}

function isDraftStation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isInteger(value.id) && typeof value.siteId === "string" && isIntegerOrNull(value.operatorId) && isDraftPlace(value.place);
}

function isDraftDifference(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return DRAFT_DIFFERENCE_FIELDS.includes(String(value.field)) && isInteger(value.observed) && isIntegerOrNull(value.stored);
}

function isDraftObserved(value: unknown): boolean {
  return isRecord(value) && DRAFT_RATS.includes(String(value.rat)) && typeof value.plmn === "string" && DRAFT_PLMN_PATTERN.test(value.plmn);
}

function isDraftIdentity(value: unknown): boolean {
  return value === null || (isRecord(value) && isInteger(value.gnbid) && isInteger(value.clid));
}

function isDraftTarget(row: UnknownRecord): boolean {
  if (row.action === "create") return row.cellId === null && row.stored === null;
  return isInteger(row.cellId) && isRecord(row.stored) && row.stored.id === row.cellId;
}

function isDraftRow(value: unknown, stationIds: ReadonlySet<unknown>): boolean {
  if (!isRecord(value) || !isInteger(value.index) || value.index < 0 || typeof value.description !== "string") return false;
  if (!DRAFT_ACTIONS.includes(String(value.action)) || !stationIds.has(value.stationId) || !isDraftObserved(value.observed)) return false;
  if (!isDraftTarget(value) || !Array.isArray(value.differences) || !value.differences.every(isDraftDifference)) return false;
  return isDraftIdentity(value.nrIdentity) && isIntegerOrNull(value.bandId);
}

export function parseAnalyzerDraft(value: unknown, expectedId: string): AnalyzerDraft | null {
  if (!isRecord(value) || value.id !== expectedId || !isDate(value.createdAt) || !isDraftFile(value.file)) return null;
  if (!isRecord(value.returnSearch) || !Array.isArray(value.stations) || !Array.isArray(value.rows)) return null;
  if (!value.stations.every(isDraftStation)) return null;

  const stationIds = new Set<unknown>(value.stations.map((station: UnknownRecord) => station.id));
  if (!value.rows.every((row) => isDraftRow(row, stationIds))) return null;

  const draft = value as unknown as AnalyzerDraft;
  return { ...draft, returnSearch: parseAnalyzerSearch(value.returnSearch) };
}
