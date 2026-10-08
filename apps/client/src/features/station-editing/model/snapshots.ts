import type {
  Cell,
  CellChange,
  LocationChange,
  Operator,
  Region,
  SectorChange,
  StationChange,
  StationIdentifier,
  StationIdentifierKind,
  StationLocation,
  Submission,
} from "@openbts/shared/contract";
import { nanoid } from "nanoid";

import {
  DEFAULT_CELL_TYPE,
  DEFAULT_NR_MODE,
  RAT_FIELDS,
  RAT_ORDER,
  carriesAreaCode,
  computeCellId,
  getAreaCodeField,
  getCellNumber,
  toDegrees,
} from "./ratFields";
import type {
  AreaCode,
  BackhaulDraft,
  CellDraft,
  CellFlagField,
  CellNumberField,
  DraftKey,
  OwnerChoice,
  PlaceDraft,
  ProposalOrphan,
  Rat,
  SectorDraft,
  StationDraft,
  StationSnapshot,
  StructureDraft,
} from "./types";
import type { StationRecord } from "@/features/station-details/station/types";

type CellInit = Partial<Omit<CellDraft, "rat">>;
type PlaceSource = Pick<StationLocation, "id" | "regionId" | "city" | "address" | "structure" | "latitude" | "longitude">;
type ProposalSource = Pick<Submission, "changes">;
type CellNumbers = CellDraft["numbers"];
type CellFlags = CellDraft["flags"];
type NumberSource = Partial<Record<CellNumberField, number | null>>;
type FlagSource = Partial<Record<CellFlagField, boolean>>;
type CountryRef = { countryCode: string };

type SectorLayer = {
  sectors: SectorDraft[];
  keysByEntryKey: Map<string, DraftKey>;
  orphans: ProposalOrphan[];
};

type CellLayer = {
  cells: CellDraft[];
  orphans: ProposalOrphan[];
};

export const IDENTIFIER_KINDS: readonly StationIdentifierKind[] = ["networksId", "networksName", "operatorName"];
export const EMPTY_BACKHAUL: BackhaulDraft = { medium: null, speedMbps: null, model: "" };
export const UNKNOWN_OWNER: OwnerChoice = { kind: "unknown" };

const NEW_ROW_PREFIX = "n";
const CELL_PREFIX = "c";
const SECTOR_PREFIX = "s";
const PROPOSED_CELL_PREFIX = "p";
const PROPOSED_SECTOR_PREFIX = "q";
const STORED_SECTOR_KEY = /^sector-(\d+)$/;
const SA_FIRST_RANK = 0;
const NSA_RANK = 1;

export function newDraftKey(): DraftKey {
  return `${NEW_ROW_PREFIX}${nanoid()}`;
}

export function toCellKey(cellId: number): DraftKey {
  return `${CELL_PREFIX}${cellId}`;
}

function toSectorKey(sectorId: number): DraftKey {
  return `${SECTOR_PREFIX}${sectorId}`;
}

export function getSectorWireKey(sector: Pick<SectorDraft, "key">): string {
  return sector.key.startsWith(PROPOSED_SECTOR_PREFIX) ? sector.key.slice(PROPOSED_SECTOR_PREFIX.length) : sector.key;
}

function createEmptyIdentifiers(): Record<StationIdentifierKind, string> {
  return { networksId: "", networksName: "", operatorName: "" };
}

function createEmptyStation(): StationDraft {
  return {
    siteId: "",
    operatorId: null,
    status: "awaitingCells",
    isConfirmed: false,
    notes: "",
    identifiers: createEmptyIdentifiers(),
    backhaul: EMPTY_BACKHAUL,
  };
}

export function createEmptyPlace(): PlaceDraft {
  return {
    locationId: null,
    latitude: null,
    longitude: null,
    regionId: null,
    isRegionPicked: false,
    city: "",
    address: "",
    structure: { type: null, owner: UNKNOWN_OWNER, note: "" },
    move: "station",
  };
}

function createSharedAreaCodes(): Record<Rat, AreaCode> {
  return {
    nr: { mode: "shared", value: null },
    lte: { mode: "shared", value: null },
    umts: { mode: "shared", value: null },
    gsm: { mode: "shared", value: null },
  };
}

export function createEmptySnapshot(): StationSnapshot {
  return { station: createEmptyStation(), place: null, sectors: [], cells: [], areaCodes: createSharedAreaCodes() };
}

export const EMPTY_SNAPSHOT: StationSnapshot = createEmptySnapshot();

export function createSectorDraft(degrees: number | null, key: DraftKey = newDraftKey()): SectorDraft {
  return { key, id: null, degrees };
}

function emptyNumbers(rat: Rat): CellNumbers {
  const numbers: CellNumbers = {};
  for (const spec of RAT_FIELDS[rat].numbers) numbers[spec.field] = null;
  return numbers;
}

function emptyFlags(rat: Rat): CellFlags {
  const flags: CellFlags = {};
  for (const spec of RAT_FIELDS[rat].flags) flags[spec.field] = false;
  return flags;
}

export function createCellDraft(rat: Rat, init: CellInit = {}): CellDraft {
  return {
    key: init.key ?? newDraftKey(),
    id: init.id ?? null,
    createdAt: init.createdAt ?? null,
    updatedAt: init.updatedAt ?? null,
    rat,
    bandId: init.bandId ?? null,
    sectorKey: init.sectorKey ?? null,
    cellType: init.cellType === undefined ? DEFAULT_CELL_TYPE : init.cellType,
    notes: init.notes ?? "",
    isConfirmed: init.isConfirmed ?? false,
    mode: rat === "nr" ? (init.mode ?? DEFAULT_NR_MODE) : null,
    numbers: { ...emptyNumbers(rat), ...init.numbers },
    flags: { ...emptyFlags(rat), ...init.flags },
    gnbidLength: init.gnbidLength ?? null,
    isDeleted: init.isDeleted ?? false,
  };
}

function readNumbers(rat: Rat, source: NumberSource, fallback: CellNumbers): CellNumbers {
  const numbers: CellNumbers = {};
  for (const { field } of RAT_FIELDS[rat].numbers) {
    const value = source[field];
    numbers[field] = value === undefined ? (fallback[field] ?? null) : value;
  }
  return numbers;
}

function readFlags(rat: Rat, source: FlagSource, fallback: CellFlags): CellFlags {
  const flags: CellFlags = {};
  for (const { field } of RAT_FIELDS[rat].flags) flags[field] = source[field] ?? fallback[field] ?? false;
  return flags;
}

function toCellDraft(cell: Cell): CellDraft {
  const numbers: NumberSource = cell;
  const flags: FlagSource = cell.rat === "umts" ? {} : cell;

  return {
    key: toCellKey(cell.id),
    id: cell.id,
    createdAt: cell.createdAt,
    updatedAt: cell.updatedAt,
    rat: cell.rat,
    bandId: cell.bandId,
    sectorKey: cell.sectorId === null ? null : toSectorKey(cell.sectorId),
    cellType: cell.cellType,
    notes: cell.notes ?? "",
    isConfirmed: cell.isConfirmed,
    mode: cell.rat === "nr" ? cell.mode : null,
    numbers: readNumbers(cell.rat, numbers, {}),
    flags: readFlags(cell.rat, flags, {}),
    gnbidLength: cell.rat === "nr" ? cell.gnbidLength : null,
    isDeleted: false,
  };
}

function getRatRank(rat: Rat): number {
  return RAT_ORDER.indexOf(rat);
}

function getModeRank(cell: Pick<CellDraft, "rat" | "mode">): number {
  return cell.rat === "nr" && cell.mode !== "sa" ? NSA_RANK : SA_FIRST_RANK;
}

function getIdentityRank(cell: CellDraft): number {
  if (cell.rat === "nr" && cell.mode !== "sa") return getCellNumber(cell, "pci") ?? 0;
  return computeCellId(cell) ?? getCellNumber(cell, "cid") ?? getCellNumber(cell, "clid") ?? 0;
}

function sortRecordCells(cells: readonly Cell[]): CellDraft[] {
  const rows = cells.map((cell) => ({ draft: toCellDraft(cell), bandRank: cell.band?.labelMhz ?? 0 }));
  rows.sort(
    (left, right) =>
      getRatRank(left.draft.rat) - getRatRank(right.draft.rat) ||
      getModeRank(left.draft) - getModeRank(right.draft) ||
      left.bandRank - right.bandRank ||
      getIdentityRank(left.draft) - getIdentityRank(right.draft) ||
      (left.draft.id ?? 0) - (right.draft.id ?? 0),
  );
  return rows.map((row) => row.draft);
}

function groupCellsByRat(cells: readonly CellDraft[]): CellDraft[] {
  return RAT_ORDER.flatMap((rat) => cells.filter((cell) => cell.rat === rat));
}

function deriveAreaCodes(cells: readonly CellDraft[]): Record<Rat, AreaCode> {
  const areaCodes = createSharedAreaCodes();

  for (const rat of RAT_ORDER) {
    const field = getAreaCodeField(rat);
    const values = cells.flatMap((cell) => (cell.rat === rat && !cell.isDeleted && carriesAreaCode(cell) ? [getCellNumber(cell, field)] : []));
    const [first = null] = values;
    areaCodes[rat] = new Set(values).size > 1 ? { mode: "perCell" } : { mode: "shared", value: first };
  }

  return areaCodes;
}

function isIdentifierKind(kind: string): kind is StationIdentifierKind {
  return IDENTIFIER_KINDS.some((known) => known === kind);
}

function readIdentifiers(identifiers: readonly StationIdentifier[]): Record<StationIdentifierKind, string> {
  const values = createEmptyIdentifiers();
  for (const identifier of identifiers) if (isIdentifierKind(identifier.kind)) values[identifier.kind] = identifier.value;
  return values;
}

export function toPlaceDraft(location: PlaceSource): PlaceDraft {
  const { structure } = location;

  return {
    locationId: location.id,
    latitude: location.latitude,
    longitude: location.longitude,
    regionId: location.regionId,
    isRegionPicked: false,
    city: location.city ?? "",
    address: location.address ?? "",
    structure: {
      type: structure.type,
      owner: structure.owner === null ? UNKNOWN_OWNER : { kind: "listed", ownerId: structure.owner.id },
      note: structure.note ?? "",
    },
    move: "station",
  };
}

export function toStationSnapshot(record: StationRecord): StationSnapshot {
  const { backhaul } = record;
  const cells = sortRecordCells(record.cells);

  return {
    station: {
      siteId: record.siteId,
      operatorId: record.operatorId,
      status: record.status,
      isConfirmed: record.isConfirmed,
      notes: record.notes ?? "",
      identifiers: readIdentifiers(record.identifiers),
      backhaul: backhaul === null ? EMPTY_BACKHAUL : { medium: backhaul.medium, speedMbps: backhaul.speedMbps, model: backhaul.model ?? "" },
    },
    place: record.location === null ? null : toPlaceDraft(record.location),
    sectors: record.sectors.map((sector) => ({ key: toSectorKey(sector.id), id: sector.id, degrees: toDegrees(sector.azimuth) })),
    cells,
    areaCodes: deriveAreaCodes(cells),
  };
}

function layIdentifiers(base: StationDraft["identifiers"], changes: StationChange["identifiers"]): StationDraft["identifiers"] {
  if (changes === undefined) return base;

  const identifiers = { ...base };
  for (const change of changes) identifiers[change.kind] = change.value ?? "";
  return identifiers;
}

function layBackhaul(base: BackhaulDraft, change: StationChange["backhaul"]): BackhaulDraft {
  if (change === undefined) return base;
  if (change === null) return EMPTY_BACKHAUL;

  return {
    medium: change.medium ?? base.medium,
    speedMbps: change.speedMbps === undefined ? base.speedMbps : change.speedMbps,
    model: change.model === undefined ? base.model : (change.model ?? ""),
  };
}

function layStation(base: StationDraft, change: StationChange | null): StationDraft {
  if (change === null) return base;

  return {
    ...base,
    siteId: change.siteId ?? base.siteId,
    operatorId: change.operatorId ?? base.operatorId,
    notes: change.notes === undefined ? base.notes : (change.notes ?? ""),
    identifiers: layIdentifiers(base.identifiers, change.identifiers),
    backhaul: layBackhaul(base.backhaul, change.backhaul),
  };
}

function layOwner(base: OwnerChoice, change: NonNullable<LocationChange["structure"]>): OwnerChoice {
  if (typeof change.ownerName === "string" && change.ownerName !== "") return { kind: "proposed", name: change.ownerName };
  if (change.ownerId === undefined) return base;
  return change.ownerId === null ? UNKNOWN_OWNER : { kind: "listed", ownerId: change.ownerId };
}

function layStructure(base: StructureDraft, change: LocationChange["structure"]): StructureDraft {
  if (change === undefined) return base;

  return {
    type: change.type === undefined ? base.type : change.type,
    owner: layOwner(base.owner, change),
    note: change.note === undefined ? base.note : (change.note ?? ""),
  };
}

function layPlace(base: PlaceDraft | null, change: LocationChange | null): PlaceDraft | null {
  if (change === null) return base;

  const place = base ?? createEmptyPlace();
  return {
    ...place,
    latitude: change.latitude ?? place.latitude,
    longitude: change.longitude ?? place.longitude,
    regionId: change.regionId ?? place.regionId,
    isRegionPicked: change.regionId !== undefined,
    city: change.city === undefined ? place.city : (change.city ?? ""),
    address: change.address === undefined ? place.address : (change.address ?? ""),
    structure: layStructure(place.structure, change.structure),
    move: change.move,
  };
}

function toProposedSector(entry: SectorChange): SectorDraft {
  return { key: `${PROPOSED_SECTOR_PREFIX}${entry.key}`, id: null, degrees: toDegrees(entry.azimuth) };
}

function layCompleteSectorList(base: readonly SectorDraft[], entries: readonly SectorChange[]): SectorLayer {
  const retained = new Map<number, SectorDraft>();
  const added: SectorDraft[] = [];
  const keysByEntryKey = new Map<string, DraftKey>();

  for (const entry of entries) {
    const degrees = toDegrees(entry.azimuth);
    const match =
      entry.id === null
        ? base.find((row) => row.id !== null && row.degrees === degrees && !retained.has(row.id))
        : base.find((row) => row.id === entry.id);
    if (match === undefined || match.id === null) {
      const row = toProposedSector(entry);
      added.push(row);
      keysByEntryKey.set(entry.key, row.key);
      continue;
    }
    retained.set(match.id, match.degrees === degrees ? match : { ...match, degrees });
    keysByEntryKey.set(entry.key, match.key);
  }

  const kept = base.flatMap((row) => (row.id === null ? [] : (retained.get(row.id) ?? [])));
  return { sectors: [...kept, ...added], keysByEntryKey, orphans: [] };
}

function laySectorChanges(base: readonly SectorDraft[], entries: readonly SectorChange[]): SectorLayer {
  const replaced = new Map<number, SectorDraft | null>();
  const added: SectorDraft[] = [];
  const keysByEntryKey = new Map<string, DraftKey>();
  const orphans: ProposalOrphan[] = [];

  for (const entry of entries) {
    if (entry.action === "create" || entry.action === null) {
      const row = toProposedSector(entry);
      added.push(row);
      keysByEntryKey.set(entry.key, row.key);
      continue;
    }
    const target = base.find((row) => row.id !== null && row.id === entry.id);
    if (target === undefined || target.id === null) {
      if (entry.id !== null) orphans.push({ kind: "sector", action: entry.action, id: entry.id });
      continue;
    }
    keysByEntryKey.set(entry.key, target.key);
    replaced.set(target.id, entry.action === "delete" ? null : { ...target, degrees: toDegrees(entry.azimuth) });
  }

  const kept = base.flatMap((row) => {
    if (row.id === null) return [row];
    const replacement = replaced.get(row.id);
    if (replacement === undefined) return [row];
    return replacement === null ? [] : [replacement];
  });
  return { sectors: [...kept, ...added], keysByEntryKey, orphans };
}

function layProposedSectors(base: readonly SectorDraft[], entries: readonly SectorChange[]): SectorLayer {
  if (entries.length === 0) return { sectors: [...base], keysByEntryKey: new Map(), orphans: [] };
  return entries.some((entry) => entry.action === null) ? layCompleteSectorList(base, entries) : laySectorChanges(base, entries);
}

function hasSector(layer: SectorLayer, key: DraftKey): boolean {
  return layer.sectors.some((sector) => sector.key === key);
}

function findStoredSectorKey(layer: SectorLayer, entryKey: string): DraftKey | null {
  const mapped = layer.keysByEntryKey.get(entryKey);
  if (mapped !== undefined) return hasSector(layer, mapped) ? mapped : null;

  const stored = STORED_SECTOR_KEY.exec(entryKey);
  if (stored === null) return null;
  const key = toSectorKey(Number(stored[1]));
  return hasSector(layer, key) ? key : null;
}

function resolveEntrySector(entry: CellChange, layer: SectorLayer, currentKey: DraftKey | null): DraftKey | null {
  if (entry.sectorKey !== null) return findStoredSectorKey(layer, entry.sectorKey);
  if (entry.sectorId !== null) return hasSector(layer, toSectorKey(entry.sectorId)) ? toSectorKey(entry.sectorId) : null;
  if (entry.isSectorCleared || currentKey === null) return null;
  return hasSector(layer, currentKey) ? currentKey : null;
}

function toProposedCell(entry: CellChange, rat: Rat, layer: SectorLayer): CellDraft {
  const numbers: NumberSource = entry;
  const flags: FlagSource = entry;

  return createCellDraft(rat, {
    key: `${PROPOSED_CELL_PREFIX}${entry.changeId}`,
    bandId: entry.bandId,
    sectorKey: resolveEntrySector(entry, layer, null),
    cellType: entry.cellType,
    notes: entry.notes ?? "",
    isConfirmed: entry.isConfirmed,
    mode: entry.mode ?? DEFAULT_NR_MODE,
    gnbidLength: rat === "nr" ? (entry.gnbidLength ?? null) : null,
    numbers: readNumbers(rat, numbers, {}),
    flags: readFlags(rat, flags, {}),
  });
}

function overlayCell(cell: CellDraft, entry: CellChange, layer: SectorLayer): CellDraft {
  const numbers: NumberSource = entry;
  const flags: FlagSource = entry;

  return {
    ...cell,
    bandId: entry.bandId,
    sectorKey: resolveEntrySector(entry, layer, cell.sectorKey),
    cellType: entry.cellType,
    notes: entry.notes ?? "",
    mode: cell.rat === "nr" ? (entry.mode ?? cell.mode) : null,
    gnbidLength: cell.rat === "nr" ? (entry.gnbidLength ?? cell.gnbidLength) : null,
    numbers: readNumbers(cell.rat, numbers, cell.numbers),
    flags: readFlags(cell.rat, flags, cell.flags),
  };
}

function detachFromMissingSector(cell: CellDraft, layer: SectorLayer): CellDraft {
  if (cell.sectorKey === null || hasSector(layer, cell.sectorKey)) return cell;
  return { ...cell, sectorKey: null };
}

function layProposedCells(base: readonly CellDraft[], entries: readonly CellChange[], layer: SectorLayer): CellLayer {
  const replaced = new Map<DraftKey, CellDraft>();
  const added: CellDraft[] = [];
  const orphans: ProposalOrphan[] = [];

  for (const entry of entries) {
    if (entry.action === "create") {
      if (entry.rat !== null) added.push(toProposedCell(entry, entry.rat, layer));
      continue;
    }
    if (entry.id === null) continue;

    const target = base.find((cell) => cell.id === entry.id);
    if (target === undefined || (entry.rat !== null && entry.rat !== target.rat)) {
      orphans.push({ kind: "cell", action: entry.action, id: entry.id });
      continue;
    }
    replaced.set(target.key, entry.action === "delete" ? { ...target, isDeleted: true } : overlayCell(target, entry, layer));
  }

  const kept = base.map((cell) => replaced.get(cell.key) ?? detachFromMissingSector(cell, layer));
  return { cells: groupCellsByRat([...kept, ...added]), orphans };
}

export function toProposedSnapshot(live: StationSnapshot | null, submission: ProposalSource): StationSnapshot {
  const base = live ?? EMPTY_SNAPSHOT;
  const { changes } = submission;
  const sectorLayer = layProposedSectors(base.sectors, changes.sectors);
  const { cells } = layProposedCells(base.cells, changes.cells, sectorLayer);

  return {
    station: layStation(base.station, changes.station),
    place: layPlace(base.place, changes.location),
    sectors: sectorLayer.sectors,
    cells,
    areaCodes: deriveAreaCodes(cells),
  };
}

export function listProposalOrphans(live: StationSnapshot | null, submission: ProposalSource): ProposalOrphan[] {
  const base = live ?? EMPTY_SNAPSHOT;
  const sectorLayer = layProposedSectors(base.sectors, submission.changes.sectors);
  const cellLayer = layProposedCells(base.cells, submission.changes.cells, sectorLayer);
  return [...sectorLayer.orphans, ...cellLayer.orphans];
}

export function findDraftCountryCode(
  draft: StationSnapshot,
  operatorsById: ReadonlyMap<number, Pick<Operator, "countryCode">>,
  regionsById: ReadonlyMap<number, Pick<Region, "countryCode">>,
  fallback: string | null,
): string | null {
  const regionId = draft.place?.regionId ?? null;
  const region: CountryRef | undefined = regionId === null ? undefined : regionsById.get(regionId);
  if (region !== undefined) return region.countryCode;

  const { operatorId } = draft.station;
  const operator: CountryRef | undefined = operatorId === null ? undefined : operatorsById.get(operatorId);
  return operator?.countryCode ?? fallback;
}

export function findDraftOperator(draft: StationSnapshot, operatorsById: ReadonlyMap<number, Operator>): Operator | null {
  const { operatorId } = draft.station;
  return operatorId === null ? null : (operatorsById.get(operatorId) ?? null);
}
