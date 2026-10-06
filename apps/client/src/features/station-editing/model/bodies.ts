import type {
  BackhaulMedium,
  CellType,
  LocationMove,
  NrMode,
  ReviewDecision,
  StationCreate,
  StationIdentifierKind,
  StationStatus,
  StationUpdate,
  StructureType,
  SubmissionCreate,
  SubmissionOrigin,
  SubmissionReview,
  SubmissionUpdate,
} from "@openbts/shared/contract";

import { findCell, getAreaValue, getBackhaulModel, isMarkerMoved, isSameOwnerChoice, listSectorEntries, normalizeText } from "./changes";
import { DEFAULT_NR_MODE, RAT_FIELDS, getAreaCodeField, getCellFlag, getCellNumber, toAzimuth } from "./ratFields";
import { EMPTY_SNAPSHOT, IDENTIFIER_KINDS, UNKNOWN_OWNER } from "./snapshots";
import type {
  BuiltBody,
  CellDraft,
  CellFlagField,
  CellNumberField,
  DraftKey,
  EditSession,
  OwnerChoice,
  PlaceDraft,
  StationDraft,
  StationSnapshot,
} from "./types";

export type PhotoPicks = {
  selectIds: readonly string[];
  removeIds: readonly string[];
  mainPhotoId: string | null;
};

type TextEdit = {
  value: string;
  stored: string | null;
};

type SubmissionCreateExtras = {
  stationId: number | null;
  note: string;
  uploadCount: number;
  picks: PhotoPicks;
  origin?: SubmissionOrigin;
};

type SubmissionUpdateExtras = {
  note?: TextEdit;
  reviewNote?: TextEdit;
  picks?: { value: PhotoPicks; stored: PhotoPicks };
};

type ReviewInput = {
  decision: ReviewDecision;
  note: string;
  expectedUpdatedAt: string;
};

type IdentifierPart = { kind: StationIdentifierKind; value: string | null };
type BackhaulPart = { medium?: BackhaulMedium; speedMbps?: number | null; model?: string | null };
type StationPart = {
  siteId?: string;
  operatorId?: number;
  notes?: string | null;
  identifiers?: IdentifierPart[];
  backhaul?: BackhaulPart | null;
  status?: StationStatus;
  isConfirmed?: boolean;
};
type StructurePart = { type?: StructureType | null; ownerId?: number | null; ownerName?: string; note?: string | null };
type LocationPart = {
  regionId?: number;
  city?: string | null;
  address?: string | null;
  structure?: StructurePart;
  latitude?: number;
  longitude?: number;
  move?: LocationMove;
};
type SectorPartEntry =
  | { action: "create"; key: string; azimuth: number | null }
  | { action: "update"; id: number; azimuth: number | null }
  | { action: "delete"; id: number };
type SectorTarget = { id: number } | { key: string };
type SectorRef = { sectorId?: number | null; sectorKey?: string };
type CellCommon = SectorRef & { cellType?: CellType | null; notes?: string | null; isConfirmed?: boolean };
type NewGsmCell = CellCommon & { rat: "gsm"; bandId: number; lac: number; cid: number; isEGsm?: boolean; bsic?: number | null };
type NewUmtsCell = CellCommon & {
  rat: "umts";
  bandId: number;
  lac?: number | null;
  rnc: number | null;
  cid: number | null;
  psc?: number | null;
  uarfcn?: number | null;
};
type NewLteCell = CellCommon & {
  rat: "lte";
  bandId: number;
  tac?: number | null;
  enbid: number | null;
  clid: number | null;
  pci?: number | null;
  earfcn?: number | null;
  supportsIot?: boolean;
};
type NewNrCell = CellCommon & {
  rat: "nr";
  bandId: number;
  mode: NrMode;
  tac?: number | null;
  gnbid?: number | null;
  clid?: number | null;
  pci?: number | null;
  arfcn?: number | null;
  supportsRedCap?: boolean;
};
type NewCell = NewGsmCell | NewUmtsCell | NewLteCell | NewNrCell;
type CellUpdateFields = SectorRef &
  Partial<Record<CellNumberField, number | null>> &
  Partial<Record<CellFlagField, boolean>> & {
    bandId?: number;
    cellType?: CellType | null;
    notes?: string | null;
    isConfirmed?: boolean;
    mode?: NrMode;
  };
type CellPartEntry = (NewCell & { action: "create" }) | (CellUpdateFields & { action: "update"; id: number }) | { action: "delete"; id: number };
type Confirmation = "all" | "new" | "none";

type SectorPlan = {
  entries: SectorPartEntry[];
  keys: DraftKey[];
  targets: Map<DraftKey, SectorTarget>;
};

type PartOptions = {
  isDirect: boolean;
  allowsOwnerName: boolean;
  confirmation: Confirmation;
  storedPlace: PlaceDraft | null;
};

type Parts = {
  station: StationPart;
  location: LocationPart | null;
  sectors: SectorPartEntry[];
  sectorKeys: DraftKey[];
  cells: CellPartEntry[];
  cellKeys: DraftKey[];
};

const DIRECT_OPTIONS: PartOptions = { isDirect: true, allowsOwnerName: false, confirmation: "all", storedPlace: null };
const SUBMITTED_OPTIONS: PartOptions = { isDirect: false, allowsOwnerName: true, confirmation: "none", storedPlace: null };

function nothingBuilt<Body>(body: Body | null = null): BuiltBody<Body> {
  return { body, cellKeys: [], sectorKeys: [] };
}

function hasKeys(part: object): boolean {
  return Object.keys(part).length > 0;
}

function toNullableText(value: string): string | null {
  const text = normalizeText(value);
  return text === "" ? null : text;
}

function isSameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;

  const leftEntries = Object.entries(left);
  const rightValues = new Map(Object.entries(right));
  if (leftEntries.length !== rightValues.size) return false;
  return leftEntries.every(([key, value]) => rightValues.has(key) && isSameJson(value, rightValues.get(key)));
}

function buildBackhaulPart(station: StationDraft, base: StationDraft): BackhaulPart | null | undefined {
  const { backhaul } = station;
  if (backhaul.medium === null) return base.backhaul.medium === null ? undefined : null;

  const part: BackhaulPart = {};
  const model = getBackhaulModel(station);
  if (backhaul.medium !== base.backhaul.medium) part.medium = backhaul.medium;
  if (backhaul.speedMbps !== base.backhaul.speedMbps) part.speedMbps = backhaul.speedMbps;
  if (model !== getBackhaulModel(base)) part.model = toNullableText(model);
  return hasKeys(part) ? part : undefined;
}

function buildStationPart(station: StationDraft, base: StationDraft, isDirect: boolean): StationPart {
  const part: StationPart = {};
  const siteId = normalizeText(station.siteId);
  const notes = normalizeText(station.notes);
  const identifiers = IDENTIFIER_KINDS.flatMap((kind): IdentifierPart[] => {
    const value = normalizeText(station.identifiers[kind]);
    return value === normalizeText(base.identifiers[kind]) ? [] : [{ kind, value: toNullableText(value) }];
  });
  const backhaul = buildBackhaulPart(station, base);

  if (siteId !== "" && siteId !== normalizeText(base.siteId)) part.siteId = siteId;
  if (station.operatorId !== null && station.operatorId !== base.operatorId) part.operatorId = station.operatorId;
  if (notes !== normalizeText(base.notes)) part.notes = toNullableText(notes);
  if (identifiers.length > 0) part.identifiers = identifiers;
  if (backhaul !== undefined) part.backhaul = backhaul;
  if (isDirect && station.status !== base.status) part.status = station.status;
  if (isDirect && station.isConfirmed !== base.isConfirmed) part.isConfirmed = station.isConfirmed;
  return part;
}

function writeOwner(part: StructurePart, owner: OwnerChoice, allowsOwnerName: boolean): void {
  if (owner.kind === "unknown") part.ownerId = null;
  if (owner.kind === "listed") part.ownerId = owner.ownerId;
  if (owner.kind === "proposed" && allowsOwnerName) part.ownerName = normalizeText(owner.name);
}

function buildStructurePart(place: PlaceDraft, base: PlaceDraft | null, isResent: boolean, options: PartOptions): StructurePart | undefined {
  const { structure } = place;
  const baseType = base?.structure.type ?? null;
  const baseOwner = base?.structure.owner ?? UNKNOWN_OWNER;
  const baseNote = normalizeText(base?.structure.note ?? "");
  const stored = options.storedPlace?.structure;
  const note = normalizeText(structure.note);
  const part: StructurePart = {};

  const writesType = structure.type !== baseType || (isResent && structure.type !== null) || (stored !== undefined && stored.type !== baseType);
  const writesOwner =
    !isSameOwnerChoice(structure.owner, baseOwner) ||
    (isResent && structure.owner.kind !== "unknown") ||
    (stored !== undefined && !isSameOwnerChoice(stored.owner, baseOwner));
  const writesNote = note !== baseNote || (isResent && note !== "") || (stored !== undefined && normalizeText(stored.note) !== baseNote);

  if (writesType) part.type = structure.type;
  if (writesOwner) writeOwner(part, structure.owner, options.allowsOwnerName);
  if (writesNote) part.note = toNullableText(note);
  return hasKeys(part) ? part : undefined;
}

function buildLocationPart(place: PlaceDraft | null, base: PlaceDraft | null, options: PartOptions): LocationPart | null {
  if (place === null) return null;

  const part: LocationPart = {};
  const isMoved = base !== null && isMarkerMoved(place, base);
  const placesStation = base === null || isMoved;
  const city = normalizeText(place.city);
  const address = normalizeText(place.address);
  const structure = buildStructurePart(place, base, isMoved && place.move === "station", options);

  if (placesStation && place.latitude !== null && place.longitude !== null) {
    part.latitude = place.latitude;
    part.longitude = place.longitude;
  }
  if (isMoved) part.move = place.move;
  if (place.isRegionPicked && place.regionId !== null && (placesStation || place.regionId !== base?.regionId)) part.regionId = place.regionId;
  if (city !== normalizeText(base?.city ?? "")) part.city = toNullableText(city);
  if (address !== normalizeText(base?.address ?? "")) part.address = toNullableText(address);
  if (structure !== undefined) part.structure = structure;
  return part;
}

function planSectors(draft: StationSnapshot, base: StationSnapshot): SectorPlan {
  const baseDegrees = new Map(base.sectors.flatMap((sector): [number, number | null][] => (sector.id === null ? [] : [[sector.id, sector.degrees]])));
  const plan: SectorPlan = { entries: [], keys: [], targets: new Map() };
  const keptIds = new Set<number>();

  for (const entry of listSectorEntries(draft.sectors)) {
    if (entry.id !== null) keptIds.add(entry.id);
    if (entry.degrees === null) {
      if (entry.id !== null) plan.targets.set(entry.rowKey, { id: entry.id });
      continue;
    }
    if (entry.id === null) {
      plan.targets.set(entry.rowKey, { key: entry.wireKey });
      plan.entries.push({ action: "create", key: entry.wireKey, azimuth: toAzimuth(entry.degrees) });
      plan.keys.push(entry.rowKey);
      continue;
    }
    plan.targets.set(entry.rowKey, { id: entry.id });
    if (baseDegrees.get(entry.id) === entry.degrees) continue;
    plan.entries.push({ action: "update", id: entry.id, azimuth: toAzimuth(entry.degrees) });
    plan.keys.push(entry.rowKey);
  }
  for (const sector of base.sectors) {
    if (sector.id === null || keptIds.has(sector.id)) continue;
    plan.entries.push({ action: "delete", id: sector.id });
    plan.keys.push(sector.key);
  }
  return plan;
}

function writeSector(fields: SectorRef, target: SectorTarget | undefined): void {
  if (target === undefined) return;
  if ("id" in target) fields.sectorId = target.id;
  else fields.sectorKey = target.key;
}

function buildCellCommon(cell: CellDraft, plan: SectorPlan, confirmation: Confirmation): CellCommon {
  const common: CellCommon = {};
  const notes = normalizeText(cell.notes);

  writeSector(common, cell.sectorKey === null ? undefined : plan.targets.get(cell.sectorKey));
  if (cell.cellType !== null) common.cellType = cell.cellType;
  if (notes !== "") common.notes = notes;
  if (confirmation !== "none") common.isConfirmed = cell.isConfirmed;
  return common;
}

function buildNewGsmCell(cell: CellDraft, common: CellCommon, bandId: number, areaValue: number | null): NewGsmCell | null {
  const cid = getCellNumber(cell, "cid");
  const bsic = getCellNumber(cell, "bsic");
  if (areaValue === null || cid === null) return null;

  const created: NewGsmCell = { ...common, rat: "gsm", bandId, lac: areaValue, cid };
  if (getCellFlag(cell, "isEGsm")) created.isEGsm = true;
  if (bsic !== null) created.bsic = bsic;
  return created;
}

function buildNewUmtsCell(cell: CellDraft, common: CellCommon, bandId: number, areaValue: number | null): NewUmtsCell {
  const psc = getCellNumber(cell, "psc");
  const uarfcn = getCellNumber(cell, "uarfcn");
  const created: NewUmtsCell = { ...common, rat: "umts", bandId, rnc: getCellNumber(cell, "rnc"), cid: getCellNumber(cell, "cid") };

  if (areaValue !== null) created.lac = areaValue;
  if (psc !== null) created.psc = psc;
  if (uarfcn !== null) created.uarfcn = uarfcn;
  return created;
}

function buildNewLteCell(cell: CellDraft, common: CellCommon, bandId: number, areaValue: number | null): NewLteCell {
  const pci = getCellNumber(cell, "pci");
  const earfcn = getCellNumber(cell, "earfcn");
  const created: NewLteCell = { ...common, rat: "lte", bandId, enbid: getCellNumber(cell, "enbid"), clid: getCellNumber(cell, "clid") };

  if (areaValue !== null) created.tac = areaValue;
  if (pci !== null) created.pci = pci;
  if (earfcn !== null) created.earfcn = earfcn;
  if (getCellFlag(cell, "supportsIot")) created.supportsIot = true;
  return created;
}

function buildNewNrCell(cell: CellDraft, common: CellCommon, bandId: number, areaValue: number | null): NewNrCell {
  const gnbid = getCellNumber(cell, "gnbid");
  const clid = getCellNumber(cell, "clid");
  const pci = getCellNumber(cell, "pci");
  const arfcn = getCellNumber(cell, "arfcn");
  const created: NewNrCell = { ...common, rat: "nr", bandId, mode: cell.mode ?? DEFAULT_NR_MODE };

  if (areaValue !== null) created.tac = areaValue;
  if (gnbid !== null) created.gnbid = gnbid;
  if (clid !== null) created.clid = clid;
  if (pci !== null) created.pci = pci;
  if (arfcn !== null) created.arfcn = arfcn;
  if (getCellFlag(cell, "supportsRedCap")) created.supportsRedCap = true;
  return created;
}

function buildNewCell(cell: CellDraft, draft: StationSnapshot, plan: SectorPlan, confirmation: Confirmation): NewCell | null {
  if (cell.bandId === null) return null;

  const common = buildCellCommon(cell, plan, confirmation);
  const areaValue = getAreaValue(draft, cell);
  if (cell.rat === "gsm") return buildNewGsmCell(cell, common, cell.bandId, areaValue);
  if (cell.rat === "umts") return buildNewUmtsCell(cell, common, cell.bandId, areaValue);
  if (cell.rat === "lte") return buildNewLteCell(cell, common, cell.bandId, areaValue);
  return buildNewNrCell(cell, common, cell.bandId, areaValue);
}

function writeSectorChange(fields: CellUpdateFields, cell: CellDraft, baseCell: CellDraft, base: StationSnapshot, plan: SectorPlan): void {
  const target = cell.sectorKey === null ? undefined : plan.targets.get(cell.sectorKey);
  const baseSectorId = base.sectors.find((sector) => sector.key === baseCell.sectorKey)?.id ?? null;

  if (target === undefined) {
    if (baseSectorId !== null) fields.sectorId = null;
    return;
  }
  if ("key" in target || target.id !== baseSectorId) writeSector(fields, target);
}

function buildCellUpdateFields(
  cell: CellDraft,
  baseCell: CellDraft,
  draft: StationSnapshot,
  base: StationSnapshot,
  plan: SectorPlan,
  confirmation: Confirmation,
): CellUpdateFields {
  const spec = RAT_FIELDS[cell.rat];
  const areaField = getAreaCodeField(cell.rat);
  const notes = normalizeText(cell.notes);
  const fields: CellUpdateFields = {};

  if (cell.bandId !== null && cell.bandId !== baseCell.bandId) fields.bandId = cell.bandId;
  writeSectorChange(fields, cell, baseCell, base, plan);
  if (cell.cellType !== baseCell.cellType) fields.cellType = cell.cellType;
  if (notes !== normalizeText(baseCell.notes)) fields.notes = toNullableText(notes);
  if (cell.mode !== null && cell.mode !== baseCell.mode) fields.mode = cell.mode;
  for (const { field } of spec.numbers) {
    const value = field === areaField ? getAreaValue(draft, cell) : getCellNumber(cell, field);
    const baseValue = field === areaField ? getAreaValue(base, baseCell) : getCellNumber(baseCell, field);
    if (value !== baseValue) fields[field] = value;
  }
  for (const { field } of spec.flags) if (getCellFlag(cell, field) !== getCellFlag(baseCell, field)) fields[field] = getCellFlag(cell, field);
  if (confirmation === "all" && cell.isConfirmed !== baseCell.isConfirmed) fields.isConfirmed = cell.isConfirmed;
  return fields;
}

function buildCellEntry(
  cell: CellDraft,
  draft: StationSnapshot,
  base: StationSnapshot,
  plan: SectorPlan,
  confirmation: Confirmation,
): CellPartEntry | null {
  if (cell.id === null) {
    const created = cell.isDeleted ? null : buildNewCell(cell, draft, plan, confirmation);
    return created === null ? null : { ...created, action: "create" };
  }
  const baseCell = findCell(base, cell.key);
  if (baseCell === undefined) return null;
  if (cell.isDeleted) return { action: "delete", id: cell.id };

  const fields = buildCellUpdateFields(cell, baseCell, draft, base, plan, confirmation);
  return hasKeys(fields) ? { ...fields, action: "update", id: cell.id } : null;
}

function buildParts(draft: StationSnapshot, base: StationSnapshot, options: PartOptions): Parts {
  const plan = planSectors(draft, base);
  const cells: CellPartEntry[] = [];
  const cellKeys: DraftKey[] = [];

  for (const cell of draft.cells) {
    const entry = buildCellEntry(cell, draft, base, plan, options.confirmation);
    if (entry === null) continue;
    cells.push(entry);
    cellKeys.push(cell.key);
  }
  return {
    station: buildStationPart(draft.station, base.station, options.isDirect),
    location: buildLocationPart(draft.place, base.place, options),
    sectors: plan.entries,
    sectorKeys: plan.keys,
    cells,
    cellKeys,
  };
}

export function countCellEntries(session: EditSession): number {
  return buildParts(session.draft, session.live ?? EMPTY_SNAPSHOT, DIRECT_OPTIONS).cells.length;
}

export function buildStationUpdate(session: EditSession): BuiltBody<StationUpdate> {
  if (session.live === null) return nothingBuilt();

  const parts = buildParts(session.draft, session.live, DIRECT_OPTIONS);
  const body: StationUpdate = {};
  if (hasKeys(parts.station)) body.station = parts.station;
  if (parts.location !== null && hasKeys(parts.location)) body.location = parts.location;
  if (parts.sectors.length > 0) body.sectors = parts.sectors;
  if (parts.cells.length > 0) body.cells = parts.cells;
  return { body: hasKeys(body) ? body : null, cellKeys: parts.cellKeys, sectorKeys: parts.sectorKeys };
}

function toNewSectors(entries: readonly SectorPartEntry[]): { key: string; azimuth: number | null }[] {
  return entries.flatMap((entry) => (entry.action === "create" ? [{ key: entry.key, azimuth: entry.azimuth }] : []));
}

function toNewCells(draft: StationSnapshot): { cells: NewCell[]; cellKeys: DraftKey[] } {
  const plan = planSectors(draft, EMPTY_SNAPSHOT);
  const cells: NewCell[] = [];
  const cellKeys: DraftKey[] = [];

  for (const cell of draft.cells) {
    const created = cell.isDeleted ? null : buildNewCell(cell, draft, plan, DIRECT_OPTIONS.confirmation);
    if (created === null) continue;
    cells.push(created);
    cellKeys.push(cell.key);
  }
  return { cells, cellKeys };
}

export function buildStationCreate(session: EditSession): BuiltBody<StationCreate> {
  const { draft } = session;
  const parts = buildParts(draft, EMPTY_SNAPSHOT, DIRECT_OPTIONS);
  const { siteId, operatorId, status: _status, ...station } = parts.station;
  const { location } = parts;
  const { cells, cellKeys } = toNewCells(draft);
  if (siteId === undefined || operatorId === undefined) return nothingBuilt();

  const body: StationCreate = { station: { ...station, siteId, operatorId, isConfirmed: draft.station.isConfirmed } };
  if (location !== null && location.latitude !== undefined && location.longitude !== undefined) {
    const { move: _move, ...place } = location;
    body.location = { ...place, latitude: location.latitude, longitude: location.longitude };
  }
  if (parts.sectors.length > 0) body.sectors = toNewSectors(parts.sectors);
  if (cells.length > 0) body.cells = cells;
  return { body, cellKeys, sectorKeys: parts.sectorKeys };
}

function buildPhotosInput(uploadCount: number, picks: PhotoPicks, allowsRemoval: boolean): SubmissionCreate["photos"] {
  const photos: NonNullable<SubmissionCreate["photos"]> = {};
  if (uploadCount > 0) photos.uploadCount = uploadCount;
  if (picks.selectIds.length > 0) photos.selectIds = [...picks.selectIds];
  if (allowsRemoval && picks.removeIds.length > 0) photos.removeIds = [...picks.removeIds];
  if (picks.mainPhotoId !== null && picks.selectIds.includes(picks.mainPhotoId)) photos.mainPhotoId = picks.mainPhotoId;
  return hasKeys(photos) ? photos : undefined;
}

function writeSubmissionLabels(item: SubmissionCreate, extras: SubmissionCreateExtras): void {
  const note = toNullableText(extras.note);
  if (note !== null) item.note = note;
  if (extras.origin !== undefined) item.origin = extras.origin;
}

function buildNewStationSubmission(session: EditSession, extras: SubmissionCreateExtras): BuiltBody<SubmissionCreate[]> {
  const parts = buildParts(session.draft, EMPTY_SNAPSHOT, SUBMITTED_OPTIONS);
  const photos = buildPhotosInput(extras.uploadCount, extras.picks, false);
  const item: SubmissionCreate = { action: "create", station: parts.station };

  writeSubmissionLabels(item, extras);
  if (parts.location !== null && hasKeys(parts.location)) item.location = parts.location;
  if (parts.sectors.length > 0) item.sectors = parts.sectors;
  if (parts.cells.length > 0) item.cells = parts.cells;
  if (photos !== undefined) item.photos = photos;
  return { body: [item], cellKeys: parts.cellKeys, sectorKeys: parts.sectorKeys };
}

function buildStationChangeSubmission(session: EditSession, extras: SubmissionCreateExtras, stationId: number): BuiltBody<SubmissionCreate[]> {
  const parts = buildParts(session.draft, session.live ?? EMPTY_SNAPSHOT, SUBMITTED_OPTIONS);
  const photos = buildPhotosInput(extras.uploadCount, extras.picks, true);
  const item: SubmissionCreate = { action: "update", stationId };

  if (hasKeys(parts.station)) item.station = parts.station;
  if (parts.location !== null && hasKeys(parts.location)) item.location = parts.location;
  if (parts.sectors.length > 0) item.sectors = parts.sectors;
  if (parts.cells.length > 0) item.cells = parts.cells;
  if (photos !== undefined) item.photos = photos;
  if (Object.keys(item).length === 2) return nothingBuilt();

  writeSubmissionLabels(item, extras);
  return { body: [item], cellKeys: parts.cellKeys, sectorKeys: parts.sectorKeys };
}

export function buildSubmissionCreate(session: EditSession, extras: SubmissionCreateExtras): BuiltBody<SubmissionCreate[]> {
  if (session.action === "create") return buildNewStationSubmission(session, extras);
  if (extras.stationId === null) return nothingBuilt();
  if (session.action === "update") return buildStationChangeSubmission(session, extras, extras.stationId);

  const item: SubmissionCreate = { action: "delete", stationId: extras.stationId };
  writeSubmissionLabels(item, extras);
  return nothingBuilt([item]);
}

function hasSameIds(ids: readonly string[], others: readonly string[]): boolean {
  return ids.length === others.length && ids.every((id) => others.includes(id));
}

export function isSamePicks(left: PhotoPicks, right: PhotoPicks): boolean {
  return left.mainPhotoId === right.mainPhotoId && hasSameIds(left.selectIds, right.selectIds) && hasSameIds(left.removeIds, right.removeIds);
}

function writeTextEdit(body: SubmissionUpdate, field: "note" | "reviewNote", edit: TextEdit | undefined): void {
  if (edit === undefined || normalizeText(edit.value) === normalizeText(edit.stored ?? "")) return;
  body[field] = toNullableText(edit.value);
}

function writePickEdit(body: SubmissionUpdate, session: EditSession, edit: SubmissionUpdateExtras["picks"]): void {
  if (edit === undefined || isSamePicks(edit.value, edit.stored)) return;

  const photos: NonNullable<SubmissionUpdate["photos"]> = {};
  const { selectIds, removeIds, mainPhotoId } = edit.value;
  if (selectIds.length > 0) photos.selectIds = [...selectIds];
  if (session.action === "update" && removeIds.length > 0) photos.removeIds = [...removeIds];
  if (mainPhotoId !== null && selectIds.includes(mainPhotoId)) photos.mainPhotoId = mainPhotoId;
  body.photos = photos;
}

export function buildSubmissionUpdate(session: EditSession, extras: SubmissionUpdateExtras = {}): BuiltBody<SubmissionUpdate> {
  const body: SubmissionUpdate = {};
  writeTextEdit(body, "note", extras.note);
  writeTextEdit(body, "reviewNote", extras.reviewNote);
  if (session.action === "delete") return nothingBuilt(hasKeys(body) ? body : null);

  const base = session.live ?? EMPTY_SNAPSHOT;
  const stored = session.proposed ?? base;
  const options: PartOptions = { ...SUBMITTED_OPTIONS, confirmation: session.kind === "review" ? "new" : "none", storedPlace: stored.place };
  const parts = buildParts(session.draft, base, options);
  const storedParts = buildParts(stored, base, options);

  if (!isSameJson(parts.station, storedParts.station)) body.station = parts.station;
  if (!isSameJson(parts.location, storedParts.location)) body.location = parts.location ?? {};
  if (!isSameJson(parts.sectors, storedParts.sectors)) body.sectors = parts.sectors;
  if (!isSameJson(parts.cells, storedParts.cells)) body.cells = parts.cells;
  writePickEdit(body, session, extras.picks);
  return { body: hasKeys(body) ? body : null, cellKeys: parts.cellKeys, sectorKeys: parts.sectorKeys };
}

export function buildSubmissionReview({ decision, note, expectedUpdatedAt }: ReviewInput): SubmissionReview {
  const review: SubmissionReview = { decision, expectedUpdatedAt };
  const text = toNullableText(note);
  if (text !== null) review.note = text;
  return review;
}
