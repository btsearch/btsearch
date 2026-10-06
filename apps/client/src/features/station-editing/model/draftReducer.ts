import type { LocationMove, StationIdentifierKind } from "@openbts/shared/contract";

import { MAX_SECTORS, RAT_FIELDS, RAT_ORDER, carriesAreaCode, getAreaCodeField, getCellNumber } from "./ratFields";
import { EMPTY_BACKHAUL, EMPTY_SNAPSHOT, IDENTIFIER_KINDS, createCellDraft, createEmptyPlace, createSectorDraft, newDraftKey } from "./snapshots";
import type {
  AreaCode,
  BackhaulDraft,
  CellDraft,
  CellFlagField,
  CellNumberField,
  DraftKey,
  EditAction,
  EditError,
  EditField,
  EditKind,
  EditSession,
  FieldTarget,
  OwnerChoice,
  PlaceDraft,
  Rat,
  SectorDraft,
  StationDraft,
  StationSnapshot,
  StructureDraft,
} from "./types";

type StationPatch = Partial<Pick<StationDraft, "siteId" | "status" | "isConfirmed" | "notes">>;
export type PlacePatch = Partial<Pick<PlaceDraft, "locationId" | "latitude" | "longitude" | "regionId" | "isRegionPicked" | "city" | "address">>;
type StructurePatch = Partial<Pick<StructureDraft, "type" | "note">>;
type PickedPlace = Omit<PlaceDraft, "move" | "isRegionPicked">;
export type CellPatch = Partial<Pick<CellDraft, "bandId" | "sectorKey" | "cellType" | "notes" | "isConfirmed" | "mode">> & {
  numbers?: CellDraft["numbers"];
  flags?: CellDraft["flags"];
};

export type SessionInput = {
  kind: EditKind;
  action: EditAction;
  countryCode: string | null;
  live: StationSnapshot | null;
  proposed: StationSnapshot | null;
  initialDraft?: StationSnapshot;
};

export type DraftAction =
  | { type: "setStation"; patch: StationPatch }
  | { type: "setOperator"; operatorId: number | null; identifierKinds: readonly StationIdentifierKind[] }
  | { type: "setIdentifier"; kind: StationIdentifierKind; value: string }
  | { type: "setBackhaul"; patch: Partial<BackhaulDraft> }
  | { type: "setPlace"; patch: PlacePatch }
  | { type: "pickPlace"; place: PickedPlace }
  | { type: "setMove"; move: LocationMove }
  | { type: "setStructure"; patch: StructurePatch }
  | { type: "setOwner"; owner: OwnerChoice }
  | { type: "addSector"; degrees?: number | null; newKey?: DraftKey }
  | { type: "setSector"; key: DraftKey; degrees: number | null }
  | { type: "removeSector"; key: DraftKey }
  | { type: "moveSector"; key: DraftKey; toIndex: number }
  | { type: "orderSectors"; keys: readonly DraftKey[] }
  | { type: "applySectors"; sectors: readonly SectorDraft[] }
  | { type: "addCell"; rat: Rat; isConfirmed: boolean; bandId?: number | null; afterKey?: DraftKey; newKey?: DraftKey }
  | { type: "setCell"; key: DraftKey; patch: CellPatch }
  | { type: "duplicateCell"; key: DraftKey; isConfirmed?: boolean; newKey?: DraftKey }
  | { type: "removeCell"; key: DraftKey }
  | { type: "restoreCell"; key: DraftKey }
  | { type: "setAreaCode"; rat: Rat; value: number | null }
  | { type: "unifyAreaCode"; rat: Rat }
  | { type: "applyCells"; cells: readonly CellDraft[] }
  | { type: "setEnabledRats"; rats: readonly Rat[] }
  | { type: "setAction"; action: EditAction }
  | { type: "revertToLive"; target: FieldTarget }
  | { type: "rebase"; live: StationSnapshot | null; proposed: StationSnapshot | null }
  | { type: "reset" }
  | { type: "attemptSave" }
  | { type: "setServerErrors"; errors: readonly EditError[] };

export type DraftDispatch = (action: DraftAction) => void;

type ErrorFilter = (error: EditError) => boolean;
type PlaceValues = Omit<PlaceDraft, "structure">;

type NewCellOptions = {
  isConfirmed: boolean;
  bandId?: number | null;
  afterKey?: DraftKey;
  newKey?: DraftKey;
};

const NO_ERRORS: EditError[] = [];
const DUPLICATE_CLEARED_NUMBERS: readonly CellNumberField[] = ["pci", "clid", "cid"];
const NODE_COPIED_TO_NEW_ROW: Partial<Record<Rat, CellNumberField>> = { lte: "enbid", umts: "rnc" };
const PLACE_VALUE_FIELDS: readonly (keyof PlaceValues)[] = [
  "locationId",
  "latitude",
  "longitude",
  "regionId",
  "isRegionPicked",
  "city",
  "address",
  "move",
];

export function listRatsWithCells(cells: readonly CellDraft[]): Rat[] {
  return RAT_ORDER.filter((rat) => cells.some((cell) => cell.rat === rat));
}

function listEnabledRats(wantedRats: readonly Rat[], cells: readonly CellDraft[]): Rat[] {
  return RAT_ORDER.filter((rat) => wantedRats.includes(rat) || cells.some((cell) => cell.rat === rat));
}

export function createSession(input: SessionInput): EditSession {
  const initial = input.initialDraft ?? input.proposed ?? input.live ?? EMPTY_SNAPSHOT;

  return {
    kind: input.kind,
    action: input.action,
    countryCode: input.countryCode,
    live: input.live,
    proposed: input.proposed,
    initial,
    draft: initial,
    enabledRats: listRatsWithCells(initial.cells),
    serverErrors: NO_ERRORS,
    isSaveAttempted: false,
  };
}

function isSameOwner(left: OwnerChoice, right: OwnerChoice): boolean {
  if (left.kind === "listed" && right.kind === "listed") return left.ownerId === right.ownerId;
  if (left.kind === "proposed" && right.kind === "proposed") return left.name === right.name;
  return left.kind === right.kind;
}

function withDraft(session: EditSession, draft: StationSnapshot): EditSession {
  return draft === session.draft ? session : { ...session, draft };
}

function withStation(session: EditSession, station: StationDraft): EditSession {
  return station === session.draft.station ? session : withDraft(session, { ...session.draft, station });
}

function withPlace(session: EditSession, place: PlaceDraft | null): EditSession {
  return place === session.draft.place ? session : withDraft(session, { ...session.draft, place });
}

function withCells(session: EditSession, cells: CellDraft[]): EditSession {
  const draft = { ...session.draft, cells };
  const enabledRats = listEnabledRats(session.enabledRats, cells);
  return { ...session, draft, enabledRats: enabledRats.length === session.enabledRats.length ? session.enabledRats : enabledRats };
}

function patchStation(session: EditSession, patch: StationPatch): EditSession {
  const { station } = session.draft;
  const next: StationDraft = {
    ...station,
    siteId: patch.siteId ?? station.siteId,
    status: patch.status ?? station.status,
    isConfirmed: patch.isConfirmed ?? station.isConfirmed,
    notes: patch.notes ?? station.notes,
  };
  const isSame =
    next.siteId === station.siteId && next.status === station.status && next.isConfirmed === station.isConfirmed && next.notes === station.notes;
  return isSame ? session : withStation(session, next);
}

function setOperator(session: EditSession, operatorId: number | null, identifierKinds: readonly StationIdentifierKind[]): EditSession {
  const { station } = session.draft;
  const identifiers = { ...station.identifiers };
  for (const kind of IDENTIFIER_KINDS) if (!identifierKinds.includes(kind)) identifiers[kind] = "";
  const keepsIdentifiers = IDENTIFIER_KINDS.every((kind) => identifiers[kind] === station.identifiers[kind]);
  if (station.operatorId === operatorId && keepsIdentifiers) return session;

  return withStation(session, { ...station, operatorId, identifiers: keepsIdentifiers ? station.identifiers : identifiers });
}

function setIdentifier(session: EditSession, kind: StationIdentifierKind, value: string): EditSession {
  const { station } = session.draft;
  if (station.identifiers[kind] === value) return session;
  return withStation(session, { ...station, identifiers: { ...station.identifiers, [kind]: value } });
}

function setBackhaul(session: EditSession, patch: Partial<BackhaulDraft>): EditSession {
  const { station } = session.draft;
  const current = station.backhaul;
  const medium = patch.medium === undefined ? current.medium : patch.medium;
  const speedMbps = patch.speedMbps === undefined ? current.speedMbps : patch.speedMbps;
  const model = patch.model ?? current.model;
  const backhaul: BackhaulDraft = medium === null ? EMPTY_BACKHAUL : { medium, speedMbps, model };
  const isSame = backhaul.medium === current.medium && backhaul.speedMbps === current.speedMbps && backhaul.model === current.model;
  return isSame ? session : withStation(session, { ...station, backhaul });
}

function patchPlace(session: EditSession, patch: Partial<PlaceValues>): EditSession {
  const current = session.draft.place;
  const place = current ?? createEmptyPlace();
  const next: PlaceDraft = {
    ...place,
    locationId: patch.locationId === undefined ? place.locationId : patch.locationId,
    latitude: patch.latitude === undefined ? place.latitude : patch.latitude,
    longitude: patch.longitude === undefined ? place.longitude : patch.longitude,
    regionId: patch.regionId === undefined ? place.regionId : patch.regionId,
    isRegionPicked: patch.isRegionPicked ?? place.isRegionPicked,
    city: patch.city ?? place.city,
    address: patch.address ?? place.address,
    move: patch.move ?? place.move,
  };
  if (current !== null && PLACE_VALUE_FIELDS.every((field) => next[field] === current[field])) return session;
  return withPlace(session, next);
}

function pickPlace(session: EditSession, picked: PickedPlace): EditSession {
  const move = session.draft.place?.move ?? "station";
  return withPlace(session, { ...picked, move, isRegionPicked: false });
}

function patchStructure(session: EditSession, patch: Partial<StructureDraft>): EditSession {
  const current = session.draft.place;
  const place = current ?? createEmptyPlace();
  const { structure } = place;
  const next: StructureDraft = {
    type: patch.type === undefined ? structure.type : patch.type,
    owner: patch.owner ?? structure.owner,
    note: patch.note ?? structure.note,
  };
  const isSame = next.type === structure.type && next.note === structure.note && isSameOwner(next.owner, structure.owner);
  if (current !== null && isSame) return session;
  return withPlace(session, { ...place, structure: next });
}

function detachCells(cells: CellDraft[], hasSectorRow: (key: DraftKey) => boolean): CellDraft[] {
  if (cells.every((cell) => cell.sectorKey === null || hasSectorRow(cell.sectorKey))) return cells;
  return cells.map((cell) => (cell.sectorKey === null || hasSectorRow(cell.sectorKey) ? cell : { ...cell, sectorKey: null }));
}

function withSectors(session: EditSession, sectors: SectorDraft[]): EditSession {
  const keys = new Set(sectors.map((sector) => sector.key));
  const cells = detachCells(session.draft.cells, (key) => keys.has(key));
  return withDraft(session, { ...session.draft, sectors, cells });
}

function addSector(session: EditSession, degrees: number | null, newKey: DraftKey | undefined): EditSession {
  const { sectors } = session.draft;
  if (sectors.length >= MAX_SECTORS) return session;
  return withSectors(session, [...sectors, createSectorDraft(degrees, newKey)]);
}

function setSector(session: EditSession, key: DraftKey, degrees: number | null): EditSession {
  const { sectors } = session.draft;
  if (!sectors.some((sector) => sector.key === key && sector.degrees !== degrees)) return session;
  return withSectors(
    session,
    sectors.map((sector) => (sector.key === key ? { ...sector, degrees } : sector)),
  );
}

function removeSector(session: EditSession, key: DraftKey): EditSession {
  const { sectors } = session.draft;
  if (!sectors.some((sector) => sector.key === key)) return session;
  return withSectors(
    session,
    sectors.filter((sector) => sector.key !== key),
  );
}

function moveSector(session: EditSession, key: DraftKey, toIndex: number): EditSession {
  const { sectors } = session.draft;
  const fromIndex = sectors.findIndex((sector) => sector.key === key);
  const target = Math.max(0, Math.min(sectors.length - 1, toIndex));
  if (fromIndex === -1 || fromIndex === target) return session;

  const moved = sectors.filter((sector) => sector.key !== key);
  moved.splice(target, 0, ...sectors.slice(fromIndex, fromIndex + 1));
  return withSectors(session, moved);
}

function orderSectors(session: EditSession, keys: readonly DraftKey[]): EditSession {
  const { sectors } = session.draft;
  const wanted = [...new Set(keys)];
  const listed = wanted.flatMap((key) => sectors.find((sector) => sector.key === key) ?? []);
  const ordered = [...listed, ...sectors.filter((sector) => !wanted.includes(sector.key))];
  if (ordered.every((sector, index) => sector === sectors[index])) return session;
  return withSectors(session, ordered);
}

function findInsertIndex(cells: readonly CellDraft[], rat: Rat, afterKey: DraftKey | undefined): number {
  const afterIndex = afterKey === undefined ? -1 : cells.findIndex((cell) => cell.key === afterKey);
  if (afterIndex !== -1) return afterIndex + 1;

  const lastOfRat = cells.findLastIndex((cell) => cell.rat === rat);
  return lastOfRat === -1 ? cells.length : lastOfRat + 1;
}

function insertCell(cells: readonly CellDraft[], rat: Rat, options: NewCellOptions): CellDraft[] {
  const first = cells.find((cell) => cell.rat === rat && !cell.isDeleted);
  const copiedNode = NODE_COPIED_TO_NEW_ROW[rat];
  const numbers: CellDraft["numbers"] = {};
  if (first !== undefined && copiedNode !== undefined) numbers[copiedNode] = getCellNumber(first, copiedNode);

  const row = createCellDraft(rat, {
    key: options.newKey ?? newDraftKey(),
    bandId: first?.bandId ?? options.bandId ?? null,
    isConfirmed: options.isConfirmed,
    numbers,
  });
  const next = [...cells];
  next.splice(findInsertIndex(cells, rat, options.afterKey), 0, row);
  return next;
}

function clearStandaloneFields(cell: CellDraft): CellDraft {
  const { numbers: numberSpecs, flags: flagSpecs } = RAT_FIELDS[cell.rat];
  const numbers = { ...cell.numbers };
  const flags = { ...cell.flags };
  for (const spec of numberSpecs) if (spec.isSaOnly) numbers[spec.field] = null;
  for (const spec of flagSpecs) if (spec.isSaOnly) flags[spec.field] = false;
  return { ...cell, numbers, flags };
}

function mergeNumbers(cell: CellDraft, patch: CellDraft["numbers"] | undefined): CellDraft["numbers"] {
  if (patch === undefined) return cell.numbers;

  const numbers = { ...cell.numbers };
  for (const { field } of RAT_FIELDS[cell.rat].numbers) {
    const value = patch[field];
    if (value !== undefined) numbers[field] = value;
  }
  return numbers;
}

function mergeFlags(cell: CellDraft, patch: CellDraft["flags"] | undefined): CellDraft["flags"] {
  if (patch === undefined) return cell.flags;

  const flags = { ...cell.flags };
  for (const { field } of RAT_FIELDS[cell.rat].flags) {
    const value = patch[field];
    if (value !== undefined) flags[field] = value;
  }
  return flags;
}

function isSameCell(left: CellDraft, right: CellDraft): boolean {
  const { numbers, flags } = RAT_FIELDS[left.rat];
  return (
    left.bandId === right.bandId &&
    left.sectorKey === right.sectorKey &&
    left.cellType === right.cellType &&
    left.notes === right.notes &&
    left.isConfirmed === right.isConfirmed &&
    left.mode === right.mode &&
    left.isDeleted === right.isDeleted &&
    numbers.every(({ field }) => getCellNumber(left, field) === getCellNumber(right, field)) &&
    flags.every(({ field }) => (left.flags[field] ?? false) === (right.flags[field] ?? false))
  );
}

function resolveMode(cell: CellDraft, patch: CellPatch): CellDraft["mode"] {
  if (cell.rat !== "nr") return null;
  return patch.mode === undefined ? cell.mode : patch.mode;
}

export function patchCell(cell: CellDraft, patch: CellPatch): CellDraft {
  const merged: CellDraft = {
    ...cell,
    bandId: patch.bandId === undefined ? cell.bandId : patch.bandId,
    sectorKey: patch.sectorKey === undefined ? cell.sectorKey : patch.sectorKey,
    cellType: patch.cellType === undefined ? cell.cellType : patch.cellType,
    notes: patch.notes ?? cell.notes,
    isConfirmed: patch.isConfirmed ?? cell.isConfirmed,
    mode: resolveMode(cell, patch),
    numbers: mergeNumbers(cell, patch.numbers),
    flags: mergeFlags(cell, patch.flags),
  };
  const next = merged.mode === "nsa" ? clearStandaloneFields(merged) : merged;
  return isSameCell(cell, next) ? cell : next;
}

function replaceCell(session: EditSession, key: DraftKey, change: (cell: CellDraft) => CellDraft): EditSession {
  const { cells } = session.draft;
  const current = cells.find((cell) => cell.key === key);
  if (current === undefined) return session;

  const next = change(current);
  if (next === current) return session;
  return withCells(
    session,
    cells.map((cell) => (cell === current ? next : cell)),
  );
}

function duplicateCell(session: EditSession, key: DraftKey, isConfirmed: boolean | undefined, newKey: DraftKey | undefined): EditSession {
  const { cells } = session.draft;
  const index = cells.findIndex((cell) => cell.key === key);
  const source = cells[index];
  if (source === undefined) return session;

  const numbers = { ...source.numbers };
  for (const field of DUPLICATE_CLEARED_NUMBERS) if (numbers[field] !== undefined) numbers[field] = null;
  const copy = createCellDraft(source.rat, {
    key: newKey ?? newDraftKey(),
    bandId: source.bandId,
    cellType: source.cellType,
    notes: source.notes,
    isConfirmed: isConfirmed ?? source.isConfirmed,
    mode: source.mode,
    numbers,
    flags: { ...source.flags },
  });
  const next = [...cells];
  next.splice(index + 1, 0, copy);
  return withCells(session, next);
}

function removeCell(session: EditSession, key: DraftKey): EditSession {
  const { cells } = session.draft;
  const current = cells.find((cell) => cell.key === key);
  if (current === undefined) return session;
  if (current.id !== null) return replaceCell(session, key, (cell) => (cell.isDeleted ? cell : { ...cell, isDeleted: true }));
  return withCells(
    session,
    cells.filter((cell) => cell !== current),
  );
}

function isSameAreaCode(left: AreaCode, right: AreaCode): boolean {
  if (left.mode === "shared" && right.mode === "shared") return left.value === right.value;
  return left.mode === right.mode;
}

function withAreaCode(session: EditSession, rat: Rat, areaCode: AreaCode): EditSession {
  const { areaCodes } = session.draft;
  if (isSameAreaCode(areaCodes[rat], areaCode)) return session;
  return withDraft(session, { ...session.draft, areaCodes: { ...areaCodes, [rat]: areaCode } });
}

export function findMostFrequentAreaCode(cells: readonly CellDraft[], rat: Rat): number | null {
  const field = getAreaCodeField(rat);
  const counts = new Map<number, number>();
  for (const cell of cells) {
    if (cell.rat !== rat || cell.isDeleted || !carriesAreaCode(cell)) continue;
    const value = getCellNumber(cell, field);
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let winner: number | null = null;
  let winnerCount = 0;
  for (const [value, count] of counts) {
    if (count <= winnerCount) continue;
    winner = value;
    winnerCount = count;
  }
  return winner;
}

function setEnabledRats(session: EditSession, rats: readonly Rat[]): EditSession {
  const enabledRats = listEnabledRats(rats, session.draft.cells);
  const isSame = enabledRats.length === session.enabledRats.length && enabledRats.every((rat, index) => rat === session.enabledRats[index]);
  return isSame ? session : { ...session, enabledRats };
}

function setAction(session: EditSession, action: EditAction): EditSession {
  if (session.live === null || session.proposed !== null || action === "create" || session.action === action) return session;
  return { ...session, action };
}

function revertStationField(session: EditSession, base: StationDraft, field: EditField | undefined): EditSession {
  const { station } = session.draft;
  if (field === undefined) return withStation(session, base);
  if (field === "identifiers") return withStation(session, { ...station, identifiers: base.identifiers });
  if (field === "networksId" || field === "networksName" || field === "operatorName") return setIdentifier(session, field, base.identifiers[field]);
  if (field === "backhaulMedium") return withStation(session, { ...station, backhaul: base.backhaul });
  if (field === "backhaulSpeedMbps") return setBackhaul(session, { speedMbps: base.backhaul.speedMbps });
  if (field === "backhaulModel") return setBackhaul(session, { model: base.backhaul.model });
  if (field === "operatorId") {
    return station.operatorId === base.operatorId ? session : withStation(session, { ...station, operatorId: base.operatorId });
  }
  if (field === "siteId") return patchStation(session, { siteId: base.siteId });
  if (field === "status") return patchStation(session, { status: base.status });
  if (field === "isConfirmed") return patchStation(session, { isConfirmed: base.isConfirmed });
  if (field === "notes") return patchStation(session, { notes: base.notes });
  return session;
}

function revertPlaceField(session: EditSession, base: PlaceDraft | null, field: EditField | undefined): EditSession {
  const { place } = session.draft;
  if (field === undefined || base === null || place === null) return withPlace(session, base);
  if (field === "coordinates") {
    const sitsOnOtherLocation = place.locationId !== null && place.locationId !== base.locationId;
    if (sitsOnOtherLocation) return withPlace(session, base);

    const regionId = place.isRegionPicked ? place.regionId : base.regionId;
    return patchPlace(session, { latitude: base.latitude, longitude: base.longitude, locationId: base.locationId, regionId });
  }
  if (field === "regionId") return patchPlace(session, { regionId: base.regionId, isRegionPicked: base.isRegionPicked });
  if (field === "city") return patchPlace(session, { city: base.city });
  if (field === "address") return patchPlace(session, { address: base.address });
  if (field === "move") return patchPlace(session, { move: base.move });
  if (field === "structureType") return patchStructure(session, { type: base.structure.type });
  if (field === "structureOwner") return patchStructure(session, { owner: base.structure.owner });
  if (field === "structureNote") return patchStructure(session, { note: base.structure.note });
  return session;
}

function revertSector(session: EditSession, base: readonly SectorDraft[], key: DraftKey | undefined): EditSession {
  const { sectors } = session.draft;
  if (key === undefined) return withSectors(session, [...base]);

  const baseIndex = base.findIndex((sector) => sector.key === key);
  const baseRow = base[baseIndex];
  if (baseRow === undefined) return removeSector(session, key);
  if (sectors.some((sector) => sector.key === key)) {
    return withSectors(
      session,
      sectors.map((sector) => (sector.key === key ? baseRow : sector)),
    );
  }

  const restored = [...sectors];
  restored.splice(Math.min(baseIndex, restored.length), 0, baseRow);
  return withSectors(session, restored.slice(0, MAX_SECTORS));
}

function isNumberOf(rat: Rat, field: EditField): field is CellNumberField {
  return RAT_FIELDS[rat].numbers.some((spec) => spec.field === field);
}

function isFlagOf(rat: Rat, field: EditField): field is CellFlagField {
  return RAT_FIELDS[rat].flags.some((spec) => spec.field === field);
}

export function toNumberPatch(field: CellNumberField, value: number | null): CellPatch {
  const numbers: CellDraft["numbers"] = {};
  numbers[field] = value;
  return { numbers };
}

export function toFlagPatch(field: CellFlagField, value: boolean): CellPatch {
  const flags: CellDraft["flags"] = {};
  flags[field] = value;
  return { flags };
}

function toFieldPatch(base: CellDraft, field: EditField): CellPatch {
  if (isNumberOf(base.rat, field)) return toNumberPatch(field, getCellNumber(base, field));
  if (isFlagOf(base.rat, field)) return toFlagPatch(field, base.flags[field] ?? false);
  if (field === "bandId") return { bandId: base.bandId };
  if (field === "sectorKey") return { sectorKey: base.sectorKey };
  if (field === "cellType") return { cellType: base.cellType };
  if (field === "notes") return { notes: base.notes };
  if (field === "isConfirmed") return { isConfirmed: base.isConfirmed };
  if (field === "mode") return { mode: base.mode };
  return {};
}

function revertCell(session: EditSession, base: readonly CellDraft[], key: DraftKey | undefined, field: EditField | undefined): EditSession {
  if (key === undefined) return session;

  const baseRow = base.find((cell) => cell.key === key);
  if (baseRow === undefined) return removeCell(session, key);

  const sectorKeys = new Set(session.draft.sectors.map((sector) => sector.key));
  const isPlaced = baseRow.sectorKey === null || sectorKeys.has(baseRow.sectorKey);
  const restored: CellDraft = isPlaced ? baseRow : { ...baseRow, sectorKey: null };
  if (field === undefined) return replaceCell(session, key, () => restored);
  return replaceCell(session, key, (cell) => patchCell(cell, toFieldPatch(restored, field)));
}

function revertAreaCode(session: EditSession, base: StationSnapshot, rat: Rat | undefined): EditSession {
  if (rat === undefined) return session;

  const field = getAreaCodeField(rat);
  const baseByKey = new Map(base.cells.map((cell) => [cell.key, cell]));
  const cells = session.draft.cells.map((cell) => {
    const baseRow = cell.rat === rat ? baseByKey.get(cell.key) : undefined;
    return baseRow === undefined ? cell : patchCell(cell, toNumberPatch(field, getCellNumber(baseRow, field)));
  });
  const hasChangedCell = cells.some((cell, index) => cell !== session.draft.cells[index]);
  const reverted = withAreaCode(session, rat, base.areaCodes[rat]);
  return hasChangedCell ? withCells(reverted, cells) : reverted;
}

function revertToLive(session: EditSession, target: FieldTarget): EditSession {
  const base = session.live ?? EMPTY_SNAPSHOT;

  if (target.scope === "station") return revertStationField(session, base.station, target.field);
  if (target.scope === "place") return revertPlaceField(session, base.place, target.field);
  if (target.scope === "sector") return revertSector(session, base.sectors, target.key);
  if (target.scope === "cell") return revertCell(session, base.cells, target.key, target.field);
  if (target.scope === "areaCode") return revertAreaCode(session, base, target.rat);
  return session;
}

function rebase(session: EditSession, live: StationSnapshot | null, proposed: StationSnapshot | null): EditSession {
  const initial = proposed ?? live ?? EMPTY_SNAPSHOT;
  const enabledRats = listEnabledRats(session.enabledRats, initial.cells);
  return { ...session, live, proposed, initial, draft: initial, enabledRats, serverErrors: NO_ERRORS, isSaveAttempted: false };
}

function reset(session: EditSession): EditSession {
  const { initial } = session;
  return { ...session, draft: initial, enabledRats: listRatsWithCells(initial.cells), serverErrors: NO_ERRORS, isSaveAttempted: false };
}

function applyAction(session: EditSession, action: DraftAction): EditSession {
  switch (action.type) {
    case "setStation":
      return patchStation(session, action.patch);
    case "setOperator":
      return setOperator(session, action.operatorId, action.identifierKinds);
    case "setIdentifier":
      return setIdentifier(session, action.kind, action.value);
    case "setBackhaul":
      return setBackhaul(session, action.patch);
    case "setPlace":
      return patchPlace(session, action.patch);
    case "pickPlace":
      return pickPlace(session, action.place);
    case "setMove":
      return session.draft.place === null ? session : patchPlace(session, { move: action.move });
    case "setStructure":
      return patchStructure(session, action.patch);
    case "setOwner":
      return patchStructure(session, { owner: action.owner });
    case "addSector":
      return addSector(session, action.degrees ?? null, action.newKey);
    case "setSector":
      return setSector(session, action.key, action.degrees);
    case "removeSector":
      return removeSector(session, action.key);
    case "moveSector":
      return moveSector(session, action.key, action.toIndex);
    case "orderSectors":
      return orderSectors(session, action.keys);
    case "applySectors":
      return withSectors(session, action.sectors.slice(0, MAX_SECTORS));
    case "addCell":
      return withCells(session, insertCell(session.draft.cells, action.rat, action));
    case "setCell":
      return replaceCell(session, action.key, (cell) => patchCell(cell, action.patch));
    case "duplicateCell":
      return duplicateCell(session, action.key, action.isConfirmed, action.newKey);
    case "removeCell":
      return removeCell(session, action.key);
    case "restoreCell":
      return replaceCell(session, action.key, (cell) => (cell.isDeleted ? { ...cell, isDeleted: false } : cell));
    case "setAreaCode":
      return withAreaCode(session, action.rat, { mode: "shared", value: action.value });
    case "unifyAreaCode":
      return withAreaCode(session, action.rat, { mode: "shared", value: findMostFrequentAreaCode(session.draft.cells, action.rat) });
    case "applyCells":
      return withCells(session, [...action.cells]);
    case "setEnabledRats":
      return setEnabledRats(session, action.rats);
    case "setAction":
      return setAction(session, action.action);
    case "revertToLive":
      return revertToLive(session, action.target);
    case "rebase":
      return rebase(session, action.live, action.proposed);
    case "reset":
      return reset(session);
    case "attemptSave":
      return session.isSaveAttempted ? session : { ...session, isSaveAttempted: true };
    case "setServerErrors":
      return { ...session, serverErrors: [...action.errors], isSaveAttempted: true };
  }
}

function findCellRat(session: EditSession, key: DraftKey): Rat | undefined {
  return session.draft.cells.find((cell) => cell.key === key)?.rat;
}

function isCellErrorOf(error: EditError, key: DraftKey | undefined, rat: Rat | undefined): boolean {
  if (error.target.scope === "areaCode") return error.target.rat === rat;
  if (error.target.scope !== "cell") return false;
  if (error.target.key !== undefined) return error.target.key === key;
  return error.target.rat === undefined || error.target.rat === rat;
}

function getOutdatedErrors(session: EditSession, action: DraftAction): ErrorFilter | null {
  switch (action.type) {
    case "setStation":
    case "setOperator":
    case "setIdentifier":
    case "setBackhaul":
      return (error) => error.target.scope === "station";
    case "setPlace":
    case "pickPlace":
    case "setMove":
    case "setStructure":
    case "setOwner":
      return (error) => error.target.scope === "place";
    case "addSector":
    case "setSector":
    case "removeSector":
    case "moveSector":
    case "orderSectors":
    case "applySectors":
      return (error) => error.target.scope === "sector";
    case "setCell":
    case "duplicateCell":
    case "removeCell":
    case "restoreCell": {
      const rat = findCellRat(session, action.key);
      return (error) => isCellErrorOf(error, action.key, rat);
    }
    case "addCell":
    case "setAreaCode":
    case "unifyAreaCode":
      return (error) => isCellErrorOf(error, undefined, action.rat);
    case "applyCells":
      return (error) => error.target.scope === "cell" || error.target.scope === "areaCode";
    case "revertToLive":
      return (error) => error.target.scope === action.target.scope;
    default:
      return null;
  }
}

export function withNewKey(action: DraftAction): DraftAction {
  if (action.type !== "addCell" && action.type !== "duplicateCell" && action.type !== "addSector") return action;
  return action.newKey === undefined ? { ...action, newKey: newDraftKey() } : action;
}

export function draftReducer(session: EditSession, action: DraftAction): EditSession {
  const next = applyAction(session, action);
  if (next === session || next.serverErrors.length === 0 || next.serverErrors !== session.serverErrors) return next;

  const isOutdated = getOutdatedErrors(session, action);
  if (isOutdated === null) return next;

  const serverErrors = next.serverErrors.filter((error) => !isOutdated(error));
  return serverErrors.length === next.serverErrors.length ? next : { ...next, serverErrors };
}
