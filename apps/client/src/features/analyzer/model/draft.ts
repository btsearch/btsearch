import type { Cell, CellDifference, CellMatchResult, NrIdentity, ObservedCell, Station } from "@openbts/shared/contract";
import { plmnCandidates } from "@openbts/shared/operatorUtils";

import type { AnalyzerSession } from "../data/session";
import { ANALYZER_RATS, DIFFERENCE_FIELDS } from "./filters";
import { findNetworkDifference, findStoredCell } from "./rows";
import { type AnalyzerSearch, parseAnalyzerSearch } from "./search";
import type { AnalyzerLookups, LogFormat, RowFacts, TickAction } from "./types";
import { toPlmnList } from "@/features/station-editing/model/networks";

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
  network?: DraftNetwork;
};

export type DraftNetwork = { code: string; plmns: string[] };

export type AnalyzerDraft = {
  id: string;
  createdAt: string;
  file: { name: string; format: LogFormat; rowCount: number; analyzedAt: string };
  returnSearch: AnalyzerSearch;
  stations: DraftStation[];
  rows: DraftRow[];
};

export type DraftInput = { session: AnalyzerSession; facts: readonly RowFacts[]; search: AnalyzerSearch; lookups: AnalyzerLookups | null };

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

function findCreatedNetwork(result: CellMatchResult, observedPlmn: string, { session, lookups }: DraftInput): DraftNetwork | undefined {
  if (result.networkMatch !== "extraCode" || result.stationId === null) return undefined;

  const observedOperator = result.operatorId === null ? undefined : lookups?.operatorsById.get(result.operatorId);
  const guestCodes = observedOperator?.operator.plmns.map((entry) => entry.plmn) ?? [];
  const code = plmnCandidates(observedPlmn).find((candidate) => guestCodes.includes(candidate)) ?? observedPlmn;
  const ownerId = session.tables.stationsById.get(result.stationId)?.operatorId ?? null;
  const ownerPlmn = ownerId === null ? null : (lookups?.operatorsById.get(ownerId)?.operator.primaryPlmn ?? null);
  return { code, plmns: toPlmnList(ownerPlmn, [code]) };
}

function findAddedNetwork(differences: readonly CellDifference[], stored: Cell): DraftNetwork | undefined {
  const difference = findNetworkDifference(differences);
  if (difference === undefined) return undefined;

  const code = difference.observed;
  return { code, plmns: stored.plmns.includes(code) ? [...stored.plmns] : [...stored.plmns, code] };
}

function toDraftRow(index: number, input: DraftInput): DraftRow | null {
  const { session, facts } = input;
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
  if (tick.action === "create") {
    const network = findCreatedNetwork(result, row.observed.plmn, input);
    return { ...base, cellId: null, stored: null, differences: [], bandId: facts[index].bandId, network };
  }

  const stored = findStoredCell(result, session.tables);
  if (stored === undefined) return null;

  const differences = tick.action === "update" ? result.differences : [];
  return { ...base, cellId: stored.id, stored, differences, bandId: stored.bandId, network: findAddedNetwork(differences, stored) };
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
  if (value.field === "network") return isDraftPlmn(value.observed) && value.stored === null;
  return DRAFT_DIFFERENCE_FIELDS.includes(String(value.field)) && isInteger(value.observed) && isIntegerOrNull(value.stored);
}

function isDraftPlmn(value: unknown): boolean {
  return typeof value === "string" && DRAFT_PLMN_PATTERN.test(value);
}

function isDraftNetwork(value: unknown): boolean {
  if (value === undefined) return true;
  return isRecord(value) && isDraftPlmn(value.code) && Array.isArray(value.plmns) && value.plmns.every(isDraftPlmn);
}

function isDraftObserved(value: unknown): boolean {
  return isRecord(value) && DRAFT_RATS.includes(String(value.rat)) && isDraftPlmn(value.plmn);
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
  return isDraftIdentity(value.nrIdentity) && isIntegerOrNull(value.bandId) && isDraftNetwork(value.network);
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
