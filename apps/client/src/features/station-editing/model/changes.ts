import type { BackhaulMedium, CellType, StationIdentifierKind, StationStatus } from "@openbts/shared/contract";
import { calculateDistance, formatDistance } from "@openbts/shared/radiolinesUtils";

import {
  CELL_FLAG_LABELS,
  CELL_NUMBER_LABELS,
  DEFAULT_GNBID_LENGTH,
  OMNIDIRECTIONAL_DEGREES,
  RAT_FIELDS,
  RAT_ORDER,
  carriesAreaCode,
  getAreaCodeField,
  getCellFlag,
  getCellNumber,
  isCellFlagField,
} from "./ratFields";
import { EMPTY_SNAPSHOT, getSectorWireKey } from "./snapshots";
import type {
  AreaCode,
  CellDraft,
  CellField,
  CellRowState,
  ChangeGroup,
  ChangeItem,
  DraftKey,
  EditSession,
  FieldMark,
  FieldState,
  FieldTarget,
  OwnerChoice,
  PlaceDraft,
  PlaceField,
  Rat,
  RatCounters,
  RowKind,
  SectorDraft,
  SectorRowState,
  StationField,
  StationSnapshot,
  TextPart,
  TextValues,
} from "./types";

export type Translate = (key: string, values?: TextValues) => string;

export type ChangeContext = {
  bandText: (bandId: number | null) => string;
  operatorName: (operatorId: number | null) => string | null;
  operatorShortName: (operatorId: number | null) => string | null;
  regionName: (regionId: number | null) => string | null;
  ownerName: (ownerId: number) => string | null;
};

type SectorEntry = {
  rowKey: DraftKey;
  id: number | null;
  wireKey: string;
  degrees: number | null;
};

type PhotoChangeCounts = {
  addedCount: number;
  shownCount: number;
  hiddenCount: number;
  hasNewMainPhoto: boolean;
};

type Comparable = string | number | boolean | null;

type FieldSpec<Field> = {
  field: Field;
  label: (draft: StationSnapshot, context: ChangeContext) => TextPart;
  read: (snapshot: StationSnapshot) => Comparable;
  describe: (snapshot: StationSnapshot, context: ChangeContext) => TextPart | null;
};

type CachedRowState = {
  live: StationSnapshot | null;
  proposed: StationSnapshot | null;
  sectorDegrees: number | null;
  isAreaShared: boolean;
  context: ChangeContext;
  state: CellRowState;
};

type CachedSectorState = {
  live: StationSnapshot | null;
  proposed: StationSnapshot | null;
  sectors: SectorDraft[];
  state: SectorRowState;
};

const EMPTY_VALUE = "-";
const FALLBACK_OPERATOR_SHORT_NAME = "MNO";
const NON_DIGITS = /\D/g;
const NO_MARKS: FieldMark[] = [];

export const TEXT_SEPARATOR = " · ";
export const COORDINATE_DIGITS = 6;
export const UNCHANGED_FIELD: FieldState = { isChanged: false, isCorrected: false, marks: NO_MARKS };

const STATUS_KEYS: Record<StationStatus, string> = {
  active: "stations:status.published",
  awaitingCells: "stations:status.pending",
  inactive: "stations:status.inactive",
};
export const BACKHAUL_MEDIUM_KEYS: Record<BackhaulMedium, string> = {
  fiber: "common:labels.uplinkFiber",
  microwave: "common:labels.uplinkMicrowave",
  satellite: "common:labels.uplinkSatellite",
};
const CELL_TYPE_KEYS: Record<CellType, string> = {
  macro: "stations:cells.cellTypes.macrocell",
  micro: "stations:cells.cellTypes.microcell",
  pico: "stations:cells.cellTypes.picocell",
  femto: "stations:cells.cellTypes.femtocell",
};
const IDENTIFIER_LABEL_KEYS: Record<Exclude<StationIdentifierKind, "operatorName">, string> = {
  networksId: "common:labels.networksId",
  networksName: "common:labels.networksName",
};
const GROUP_KEYS: Record<Exclude<ChangeGroup, Rat>, string> = {
  station: "common:labels.station",
  place: "common:labels.location",
  sectors: "common:labels.azimuths",
  photos: "submissions:photos.label",
};
const UNKNOWN_KEY = "common:labels.unknown";
const YES_KEY = "common:labels.yes";
const NO_KEY = "common:labels.no";
const OMNIDIRECTIONAL_KEY = "stationDetails:sectors.omnidirectional";
const GENERAL_GROUP_KEY = "stations:edit.groups.general";
const CELLS_KEY = "common:labels.cells";

const cellsByKey = new WeakMap<StationSnapshot, Map<DraftKey, CellDraft>>();
const entriesBySectors = new WeakMap<readonly SectorDraft[], SectorEntry[]>();
const rowStates = new WeakMap<CellDraft, CachedRowState>();
const sectorStates = new WeakMap<SectorDraft, CachedSectorState>();

export function formatTextPart(part: TextPart | null, translate: Translate): string {
  if (part === null) return EMPTY_VALUE;
  return "key" in part ? translate(part.key, part.values) : part.text;
}

export function formatTextParts(parts: readonly TextPart[], translate: Translate): string {
  return parts.map((part) => formatTextPart(part, translate)).join(TEXT_SEPARATOR);
}

export function normalizeText(value: string): string {
  return value.trim();
}

export function keepDigits(text: string): string {
  return text.replace(NON_DIGITS, "");
}

export function parseDigits(text: string, mostDigits?: number): number | null {
  const digits = keepDigits(text).slice(0, mostDigits);
  return digits === "" ? null : Number(digits);
}

export function formatCoordinate(value: number): string {
  return value.toFixed(COORDINATE_DIGITS);
}

export function formatCoordinatePair(latitude: number, longitude: number): string {
  return `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`;
}

function toTextPart(value: string): TextPart | null {
  const text = normalizeText(value);
  return text === "" ? null : { text };
}

function toNumberPart(value: number | null): TextPart | null {
  return value === null ? null : { text: String(value) };
}

function toBooleanPart(value: boolean): TextPart {
  return { key: value ? YES_KEY : NO_KEY };
}

export function toDegreesPart(degrees: number | null): TextPart | null {
  if (degrees === null) return null;
  return degrees === OMNIDIRECTIONAL_DEGREES ? { key: OMNIDIRECTIONAL_KEY } : { text: `${degrees}°` };
}

export function getGroupLabel(group: ChangeGroup): TextPart {
  if (group === "station" || group === "place" || group === "sectors" || group === "photos") return { key: GROUP_KEYS[group] };
  return { text: RAT_FIELDS[group].name };
}

function indexCells(snapshot: StationSnapshot): Map<DraftKey, CellDraft> {
  const known = cellsByKey.get(snapshot);
  if (known !== undefined) return known;

  const index = new Map(snapshot.cells.map((cell): [DraftKey, CellDraft] => [cell.key, cell]));
  cellsByKey.set(snapshot, index);
  return index;
}

export function findCell(snapshot: StationSnapshot, key: DraftKey): CellDraft | undefined {
  return indexCells(snapshot).get(key);
}

function getSectorDegrees(snapshot: StationSnapshot, sectorKey: DraftKey | null): number | null {
  if (sectorKey === null) return null;
  return snapshot.sectors.find((sector) => sector.key === sectorKey)?.degrees ?? null;
}

export function getAreaValue(snapshot: StationSnapshot, cell: CellDraft): number | null {
  if (!carriesAreaCode(cell)) return null;

  const areaCode = snapshot.areaCodes[cell.rat];
  return areaCode.mode === "shared" ? areaCode.value : getCellNumber(cell, getAreaCodeField(cell.rat));
}

export function listSectorEntries(sectors: readonly SectorDraft[]): SectorEntry[] {
  const known = entriesBySectors.get(sectors);
  if (known !== undefined) return known;

  const rows = sectors.filter((sector) => sector.id !== null || sector.degrees !== null);
  const ids = rows.flatMap((sector) => (sector.id === null ? [] : [sector.id])).sort((left, right) => left - right);
  const added = rows.filter((sector) => sector.id === null);
  const entries = rows.map((row, index): SectorEntry => {
    const id = ids[index] ?? null;
    const slot = added[index - ids.length] ?? row;
    return { rowKey: row.key, id, wireKey: id === null ? getSectorWireKey(slot) : "", degrees: row.degrees };
  });
  entriesBySectors.set(sectors, entries);
  return entries;
}

function isSameEntry(left: SectorEntry, right: SectorEntry): boolean {
  return left.id === null ? right.id === null && left.wireKey === right.wireKey : left.id === right.id;
}

function findEntry(entries: readonly SectorEntry[], wanted: SectorEntry): SectorEntry | undefined {
  return entries.find((entry) => isSameEntry(entry, wanted));
}

function isMarkerAt(place: PlaceDraft, other: PlaceDraft): boolean {
  return place.latitude === other.latitude && place.longitude === other.longitude;
}

export function isMarkerMoved(place: PlaceDraft | null, basePlace: PlaceDraft | null): boolean {
  if (place === null || basePlace === null) return false;
  return place.latitude !== null && place.longitude !== null && !isMarkerAt(place, basePlace);
}

export function hasMarkerMoved(session: EditSession): boolean {
  return isMarkerMoved(session.draft.place, session.live?.place ?? null);
}

export function movesStationAlone(session: EditSession): boolean {
  return hasMarkerMoved(session) && session.draft.place?.move !== "location";
}

export function getMoveDistance(place: PlaceDraft | null, basePlace: PlaceDraft | null): number | null {
  if (place === null || basePlace === null) return null;
  if (place.latitude === null || place.longitude === null || basePlace.latitude === null || basePlace.longitude === null) return null;
  return calculateDistance(basePlace.latitude, basePlace.longitude, place.latitude, place.longitude);
}

export function getBackhaulModel(station: StationSnapshot["station"]): string {
  return station.backhaul.medium === "microwave" ? normalizeText(station.backhaul.model) : "";
}

function readOwner(owner: OwnerChoice): string {
  if (owner.kind === "listed") return `listed:${owner.ownerId}`;
  if (owner.kind === "proposed") return `proposed:${normalizeText(owner.name)}`;
  return "unknown";
}

export function isSameOwnerChoice(left: OwnerChoice, right: OwnerChoice): boolean {
  return readOwner(left) === readOwner(right);
}

function describeOwner(owner: OwnerChoice, context: ChangeContext): TextPart {
  if (owner.kind === "unknown") return { key: UNKNOWN_KEY };
  if (owner.kind === "proposed") return { key: "stations:edit.changes.proposedOwner", values: { name: normalizeText(owner.name) } };
  return { text: context.ownerName(owner.ownerId) ?? `#${owner.ownerId}` };
}

function describeMedium(medium: BackhaulMedium | null): TextPart {
  return { key: medium === null ? UNKNOWN_KEY : BACKHAUL_MEDIUM_KEYS[medium] };
}

function describeCoordinates(place: PlaceDraft | null): TextPart | null {
  if (place === null || place.latitude === null || place.longitude === null) return null;
  return { text: formatCoordinatePair(place.latitude, place.longitude) };
}

function readCoordinates(place: PlaceDraft | null): string | null {
  if (place === null || place.latitude === null || place.longitude === null) return null;
  return `${place.latitude},${place.longitude}`;
}

function identifierSpec(kind: Exclude<StationIdentifierKind, "operatorName">): FieldSpec<StationField> {
  return {
    field: kind,
    label: () => ({ key: IDENTIFIER_LABEL_KEYS[kind] }),
    read: (snapshot) => normalizeText(snapshot.station.identifiers[kind]),
    describe: (snapshot) => toTextPart(snapshot.station.identifiers[kind]),
  };
}

const STATION_SPECS: readonly FieldSpec<StationField>[] = [
  {
    field: "siteId",
    label: () => ({ key: "common:labels.stationId" }),
    read: (snapshot) => normalizeText(snapshot.station.siteId),
    describe: (snapshot) => toTextPart(snapshot.station.siteId),
  },
  {
    field: "operatorId",
    label: () => ({ key: "common:labels.operator" }),
    read: (snapshot) => snapshot.station.operatorId,
    describe: (snapshot, context) => toTextPart(context.operatorName(snapshot.station.operatorId) ?? ""),
  },
  {
    field: "status",
    label: () => ({ key: "common:labels.status" }),
    read: (snapshot) => snapshot.station.status,
    describe: (snapshot) => ({ key: STATUS_KEYS[snapshot.station.status] }),
  },
  {
    field: "operatorName",
    label: (draft, context) => ({
      key: "common:labels.mnoName",
      values: { brand: context.operatorShortName(draft.station.operatorId) ?? FALLBACK_OPERATOR_SHORT_NAME },
    }),
    read: (snapshot) => normalizeText(snapshot.station.identifiers.operatorName),
    describe: (snapshot) => toTextPart(snapshot.station.identifiers.operatorName),
  },
  identifierSpec("networksId"),
  identifierSpec("networksName"),
  {
    field: "backhaulMedium",
    label: () => ({ text: "Uplink" }),
    read: (snapshot) => snapshot.station.backhaul.medium,
    describe: (snapshot) => describeMedium(snapshot.station.backhaul.medium),
  },
  {
    field: "backhaulSpeedMbps",
    label: () => ({ key: "common:labels.uplinkSpeed" }),
    read: (snapshot) => snapshot.station.backhaul.speedMbps,
    describe: (snapshot) => toNumberPart(snapshot.station.backhaul.speedMbps),
  },
  {
    field: "backhaulModel",
    label: () => ({ key: "common:labels.uplinkModel" }),
    read: (snapshot) => getBackhaulModel(snapshot.station),
    describe: (snapshot) => toTextPart(getBackhaulModel(snapshot.station)),
  },
  {
    field: "notes",
    label: () => ({ key: "common:labels.notes" }),
    read: (snapshot) => normalizeText(snapshot.station.notes),
    describe: (snapshot) => toTextPart(snapshot.station.notes),
  },
  {
    field: "isConfirmed",
    label: () => ({ key: "common:labels.confirmed" }),
    read: (snapshot) => snapshot.station.isConfirmed,
    describe: (snapshot) => toBooleanPart(snapshot.station.isConfirmed),
  },
];

const PLACE_SPECS: readonly FieldSpec<PlaceField>[] = [
  {
    field: "coordinates",
    label: () => ({ key: "common:labels.coordinates" }),
    read: (snapshot) => readCoordinates(snapshot.place),
    describe: (snapshot) => describeCoordinates(snapshot.place),
  },
  {
    field: "regionId",
    label: () => ({ key: "stationDetails:specs.region" }),
    read: (snapshot) => snapshot.place?.regionId ?? null,
    describe: (snapshot, context) => toTextPart(context.regionName(snapshot.place?.regionId ?? null) ?? ""),
  },
  {
    field: "city",
    label: () => ({ key: "common:labels.city" }),
    read: (snapshot) => normalizeText(snapshot.place?.city ?? ""),
    describe: (snapshot) => toTextPart(snapshot.place?.city ?? ""),
  },
  {
    field: "address",
    label: () => ({ key: "common:labels.address" }),
    read: (snapshot) => normalizeText(snapshot.place?.address ?? ""),
    describe: (snapshot) => toTextPart(snapshot.place?.address ?? ""),
  },
  {
    field: "structureType",
    label: () => ({ key: "common:structure.type" }),
    read: (snapshot) => snapshot.place?.structure.type ?? null,
    describe: (snapshot) => {
      const type = snapshot.place?.structure.type ?? null;
      return type === null ? null : { key: `common:structure.types.${type}` };
    },
  },
  {
    field: "structureOwner",
    label: () => ({ key: "common:structure.owner" }),
    read: (snapshot) => (snapshot.place === null ? null : readOwner(snapshot.place.structure.owner)),
    describe: (snapshot, context) => (snapshot.place === null ? null : describeOwner(snapshot.place.structure.owner, context)),
  },
  {
    field: "structureNote",
    label: () => ({ key: "common:structure.note" }),
    read: (snapshot) => normalizeText(snapshot.place?.structure.note ?? ""),
    describe: (snapshot) => toTextPart(snapshot.place?.structure.note ?? ""),
  },
];

function differsInPlace(spec: FieldSpec<PlaceField>, draft: StationSnapshot, base: StationSnapshot): boolean {
  if (draft.place === null) return false;
  if (spec.field === "regionId" && !draft.place.isRegionPicked) return false;
  return spec.read(draft) !== spec.read(base);
}

function pairItem(group: ChangeGroup, target: FieldTarget, label: TextPart[], before: TextPart | null, after: TextPart | null): ChangeItem {
  return { group, target, kind: "changed", label, pair: { before, after }, isCorrection: false };
}

function plainItem(group: ChangeGroup, target: FieldTarget, kind: ChangeItem["kind"], label: TextPart[]): ChangeItem {
  return { group, target, kind, label, pair: null, isCorrection: false };
}

function listStationChanges(draft: StationSnapshot, base: StationSnapshot, context: ChangeContext): ChangeItem[] {
  return STATION_SPECS.flatMap((spec) => {
    if (spec.read(draft) === spec.read(base)) return [];

    const target: FieldTarget = { scope: "station", field: spec.field };
    if (spec.field !== "isConfirmed") {
      return [pairItem("station", target, [spec.label(draft, context)], spec.describe(base, context), spec.describe(draft, context))];
    }
    const key = draft.station.isConfirmed ? "stations:edit.changes.stationConfirmed" : "stations:edit.changes.stationUnconfirmed";
    return [plainItem("station", target, "changed", [{ key }])];
  });
}

function describeMove(place: PlaceDraft, basePlace: PlaceDraft): TextPart {
  const values = { distance: formatDistance(getMoveDistance(place, basePlace) ?? 0) };
  if (place.move === "location") return { key: "stations:edit.changes.locationMoved", values };

  const joinsOtherPlace = place.locationId !== null && place.locationId !== basePlace.locationId;
  return { key: joinsOtherPlace ? "stations:edit.changes.stationMovedToExisting" : "stations:edit.changes.stationMoved", values };
}

function listPlaceChanges(draft: StationSnapshot, base: StationSnapshot, context: ChangeContext): ChangeItem[] {
  const { place } = draft;
  if (place === null) return [];

  return PLACE_SPECS.flatMap((spec) => {
    if (!differsInPlace(spec, draft, base)) return [];

    const target: FieldTarget = { scope: "place", field: spec.field };
    if (spec.field === "coordinates" && base.place !== null && isMarkerMoved(place, base.place)) {
      return [plainItem("place", target, "changed", [describeMove(place, base.place)])];
    }
    return [pairItem("place", target, [spec.label(draft, context)], spec.describe(base, context), spec.describe(draft, context))];
  });
}

function describeNewSector(degrees: number | null): TextPart {
  if (degrees === null) return { key: "stations:edit.changes.sectorAddedEmpty" };
  if (degrees === OMNIDIRECTIONAL_DEGREES) return { key: "stations:edit.changes.sectorAddedOmni" };
  return { key: "stations:edit.changes.sectorAdded", values: { degrees } };
}

function describeRemovedSector(degrees: number | null): TextPart {
  if (degrees === OMNIDIRECTIONAL_DEGREES) return { key: "stations:edit.changes.sectorRemovedOmni" };
  return { key: "stations:edit.changes.sectorRemoved", values: { degrees: degrees ?? EMPTY_VALUE } };
}

function listSectorChanges(draft: StationSnapshot, base: StationSnapshot): ChangeItem[] {
  const entries = listSectorEntries(draft.sectors);
  const baseEntries = listSectorEntries(base.sectors);
  const items: ChangeItem[] = [];

  for (const sector of draft.sectors) {
    const target: FieldTarget = { scope: "sector", key: sector.key, field: "degrees" };
    const entry = entries.find((candidate) => candidate.rowKey === sector.key);
    const baseEntry = entry === undefined ? undefined : findEntry(baseEntries, entry);
    if (entry === undefined || baseEntry === undefined) items.push(plainItem("sectors", target, "added", [describeNewSector(sector.degrees)]));
    else if (baseEntry.degrees !== entry.degrees) {
      const label: TextPart[] = [{ key: "common:labels.azimuth" }];
      items.push(pairItem("sectors", target, label, toDegreesPart(baseEntry.degrees), toDegreesPart(entry.degrees)));
    }
  }
  for (const baseEntry of baseEntries) {
    if (findEntry(entries, baseEntry) !== undefined) continue;
    items.push(plainItem("sectors", { scope: "sector", key: baseEntry.rowKey }, "removed", [describeRemovedSector(baseEntry.degrees)]));
  }
  return items;
}

function describeCellIdentity(cell: CellDraft, snapshot: StationSnapshot): TextPart {
  if (cell.rat === "nr") return toDegreesPart(getSectorDegrees(snapshot, cell.sectorKey)) ?? { key: "stations:edit.cellName.noAzimuth" };

  if (cell.rat === "lte") {
    const clid = getCellNumber(cell, "clid");
    return clid === null ? { key: "stations:edit.cellName.noClid" } : { text: `CLID ${clid}` };
  }
  const cid = getCellNumber(cell, "cid");
  return cid === null ? { key: "stations:edit.cellName.noCid" } : { text: `CID ${cid}` };
}

function describeCell(cell: CellDraft, snapshot: StationSnapshot, context: ChangeContext): TextPart[] {
  return [{ text: `${RAT_FIELDS[cell.rat].name} ${context.bandText(cell.bandId)}` }, describeCellIdentity(cell, snapshot)];
}

export function describeTarget(target: FieldTarget, snapshot: StationSnapshot, context: ChangeContext): TextPart[] {
  if (target.scope === "station") return [getGroupLabel("station")];
  if (target.scope === "place") return [getGroupLabel("place")];
  if (target.scope === "sector") return [getGroupLabel("sectors")];
  if (target.scope === "photos") return [getGroupLabel("photos")];
  if (target.scope === "general") return [{ key: GENERAL_GROUP_KEY }];

  const cell = target.key === undefined ? undefined : findCell(snapshot, target.key);
  if (target.scope === "cell" && cell !== undefined) return describeCell(cell, snapshot, context);
  return [target.rat === undefined ? { key: CELLS_KEY } : getGroupLabel(target.rat)];
}

function isSectorChanged(cell: CellDraft, baseCell: CellDraft, draft: StationSnapshot, base: StationSnapshot): boolean {
  if (cell.sectorKey === baseCell.sectorKey) return false;
  return getSectorDegrees(draft, cell.sectorKey) !== getSectorDegrees(base, baseCell.sectorKey);
}

function isAreaValueChanged(cell: CellDraft, baseCell: CellDraft, draft: StationSnapshot, base: StationSnapshot): boolean {
  if (draft.areaCodes[cell.rat].mode === "shared") return false;
  return getAreaValue(draft, cell) !== getAreaValue(base, baseCell);
}

function listChangedCellFields(cell: CellDraft, baseCell: CellDraft, draft: StationSnapshot, base: StationSnapshot): CellField[] {
  const spec = RAT_FIELDS[cell.rat];
  const fields: CellField[] = [];

  if (cell.bandId !== baseCell.bandId) fields.push("bandId");
  if (isSectorChanged(cell, baseCell, draft, base)) fields.push("sectorKey");
  if (cell.mode !== baseCell.mode) fields.push("mode");
  if (cell.rat === "nr" && cell.mode === "sa" && (cell.gnbidLength ?? DEFAULT_GNBID_LENGTH) !== (baseCell.gnbidLength ?? DEFAULT_GNBID_LENGTH))
    fields.push("gnbidLength");
  for (const { field } of spec.numbers) {
    const isChanged =
      field === spec.areaCodeField ? isAreaValueChanged(cell, baseCell, draft, base) : getCellNumber(cell, field) !== getCellNumber(baseCell, field);
    if (isChanged) fields.push(field);
  }
  for (const { field } of spec.flags) if (getCellFlag(cell, field) !== getCellFlag(baseCell, field)) fields.push(field);
  if (cell.cellType !== baseCell.cellType) fields.push("cellType");
  if (cell.isConfirmed !== baseCell.isConfirmed) fields.push("isConfirmed");
  if (normalizeText(cell.notes) !== normalizeText(baseCell.notes)) fields.push("notes");
  return fields;
}

function describeCellValue(cell: CellDraft, field: CellField, snapshot: StationSnapshot, context: ChangeContext): TextPart | null {
  if (field === "bandId") return { text: context.bandText(cell.bandId) };
  if (field === "sectorKey") return toDegreesPart(getSectorDegrees(snapshot, cell.sectorKey));
  if (field === "cellType") return cell.cellType === null ? null : { key: CELL_TYPE_KEYS[cell.cellType] };
  if (field === "notes") return toTextPart(cell.notes);
  if (field === "isConfirmed") return toBooleanPart(cell.isConfirmed);
  if (field === "mode") return cell.mode === null ? null : { text: cell.mode.toUpperCase() };
  if (field === "gnbidLength") return toNumberPart(cell.gnbidLength ?? DEFAULT_GNBID_LENGTH);
  if (isCellFlagField(field)) return toBooleanPart(getCellFlag(cell, field));
  if (field === getAreaCodeField(cell.rat)) return toNumberPart(getAreaValue(snapshot, cell));
  return toNumberPart(getCellNumber(cell, field));
}

function describeCellField(field: CellField): TextPart {
  if (field === "bandId") return { key: "stations:edit.changes.fields.band" };
  if (field === "sectorKey") return { key: "stations:edit.changes.fields.azimuth" };
  if (field === "cellType") return { key: "stations:edit.changes.fields.cellType" };
  if (field === "notes") return { key: "stations:edit.changes.fields.note" };
  if (field === "mode") return { key: "stations:edit.changes.fields.mode" };
  if (field === "gnbidLength") return { key: "stations:edit.cells.columns.gnbidLength" };
  if (field === "isConfirmed") return { key: "common:labels.confirmed" };
  if (isCellFlagField(field)) return { text: CELL_FLAG_LABELS[field] };
  return { text: CELL_NUMBER_LABELS[field] };
}

function toCellFieldItem(
  cell: CellDraft,
  baseCell: CellDraft,
  field: CellField,
  draft: StationSnapshot,
  base: StationSnapshot,
  context: ChangeContext,
): ChangeItem {
  const target: FieldTarget = { scope: "cell", key: cell.key, rat: cell.rat, field };
  const name: TextPart[] = [{ text: context.bandText(cell.bandId) }, describeCellIdentity(cell, draft)];

  if (field === "isConfirmed") {
    const key = cell.isConfirmed ? "stations:edit.changes.cellConfirmed" : "stations:edit.changes.cellUnconfirmed";
    return plainItem(cell.rat, target, "changed", [...name, { key }]);
  }
  if (isCellFlagField(field)) {
    const key = getCellFlag(cell, field) ? "stations:edit.changes.flagOn" : "stations:edit.changes.flagOff";
    return plainItem(cell.rat, target, "changed", [...name, { key, values: { flag: CELL_FLAG_LABELS[field] } }]);
  }
  const before = describeCellValue(baseCell, field, base, context);
  const after = describeCellValue(cell, field, draft, context);
  return pairItem(cell.rat, target, [...name, describeCellField(field)], before, after);
}

function toCellRowItem(cell: CellDraft, snapshot: StationSnapshot, context: ChangeContext, kind: ChangeItem["kind"], key: string): ChangeItem {
  const label: TextPart[] = [{ key, values: { band: context.bandText(cell.bandId) } }, describeCellIdentity(cell, snapshot)];
  return plainItem(cell.rat, { scope: "cell", key: cell.key, rat: cell.rat }, kind, label);
}

function listCellChanges(cell: CellDraft, draft: StationSnapshot, base: StationSnapshot, context: ChangeContext): ChangeItem[] {
  const baseCell = findCell(base, cell.key);
  if (baseCell === undefined) return [toCellRowItem(cell, draft, context, "added", "stations:edit.changes.cellAdded")];
  if (cell.isDeleted) return baseCell.isDeleted ? [] : [toCellRowItem(cell, draft, context, "removed", "stations:edit.changes.cellRemoved")];

  const restored = baseCell.isDeleted ? [toCellRowItem(cell, draft, context, "added", "stations:edit.changes.cellRestored")] : [];
  const fields = listChangedCellFields(cell, baseCell, draft, base);
  return [...restored, ...fields.map((field) => toCellFieldItem(cell, baseCell, field, draft, base, context))];
}

function hasAreaCarrier(snapshot: StationSnapshot, rat: Rat): boolean {
  return snapshot.cells.some((cell) => cell.rat === rat && !cell.isDeleted && carriesAreaCode(cell));
}

function isAreaCodeChanged(rat: Rat, draft: StationSnapshot, base: StationSnapshot): boolean {
  const areaCode = draft.areaCodes[rat];
  if (areaCode.mode !== "shared" || !hasAreaCarrier(draft, rat)) return false;

  const baseAreaCode = base.areaCodes[rat];
  return baseAreaCode.mode === "shared" ? baseAreaCode.value !== areaCode.value : hasAreaCarrier(base, rat);
}

function describeAreaCode(areaCode: AreaCode): TextPart | null {
  return areaCode.mode === "shared" ? toNumberPart(areaCode.value) : { key: "stations:edit.changes.areaCodeMixed" };
}

function listAreaCodeChanges(rat: Rat, draft: StationSnapshot, base: StationSnapshot): ChangeItem[] {
  if (!isAreaCodeChanged(rat, draft, base)) return [];

  const field = getAreaCodeField(rat);
  const label: TextPart[] = [{ key: "stations:edit.changes.areaCodeAll", values: { field: CELL_NUMBER_LABELS[field] } }];
  return [pairItem(rat, { scope: "areaCode", rat, field }, label, describeAreaCode(base.areaCodes[rat]), describeAreaCode(draft.areaCodes[rat]))];
}

function listRatChanges(rat: Rat, draft: StationSnapshot, base: StationSnapshot, context: ChangeContext): ChangeItem[] {
  const rows = draft.cells.filter((cell) => cell.rat === rat).flatMap((cell) => listCellChanges(cell, draft, base, context));
  const dropped = base.cells
    .filter((cell) => cell.rat === rat && !cell.isDeleted && findCell(draft, cell.key) === undefined)
    .map((cell) => toCellRowItem(cell, base, context, "removed", "stations:edit.changes.cellRemoved"));
  return [...listAreaCodeChanges(rat, draft, base), ...rows, ...dropped];
}

function buildChanges(draft: StationSnapshot, base: StationSnapshot, context: ChangeContext): ChangeItem[] {
  return [
    ...listStationChanges(draft, base, context),
    ...listPlaceChanges(draft, base, context),
    ...listSectorChanges(draft, base),
    ...RAT_ORDER.flatMap((rat) => listRatChanges(rat, draft, base, context)),
  ];
}

function toTargetId(target: FieldTarget): string {
  return `${target.scope}|${target.key ?? ""}|${target.rat ?? ""}|${target.field ?? ""}`;
}

function toRowId(target: FieldTarget): string {
  return `${target.scope}|${target.key ?? ""}`;
}

function markCorrections(changes: ChangeItem[], corrections: readonly ChangeItem[]): ChangeItem[] {
  if (corrections.length === 0) return changes;

  const fieldIds = new Set(corrections.map((item) => toTargetId(item.target)));
  const rowIds = new Set(corrections.flatMap((item) => (item.target.key === undefined ? [] : [toRowId(item.target)])));
  return changes.map((item) => {
    const isRowItem = item.target.key !== undefined && item.target.field === undefined;
    const isCorrection = fieldIds.has(toTargetId(item.target)) || (isRowItem && rowIds.has(toRowId(item.target)));
    return isCorrection ? { ...item, isCorrection } : item;
  });
}

export function listChanges(session: EditSession, context: ChangeContext): { changes: ChangeItem[]; corrections: ChangeItem[] } {
  if (session.action === "delete") return { changes: [], corrections: [] };

  const base = session.live ?? EMPTY_SNAPSHOT;
  const corrections =
    session.proposed === null ? [] : buildChanges(session.draft, session.proposed, context).map((item) => ({ ...item, isCorrection: true }));
  return { changes: markCorrections(buildChanges(session.draft, base, context), corrections), corrections };
}

export function getRowKind(session: EditSession, cell: CellDraft): RowKind {
  if (cell.isDeleted) return "deleted";

  const base = session.live ?? EMPTY_SNAPSHOT;
  const baseCell = findCell(base, cell.key);
  if (baseCell === undefined) return "new";
  return listChangedCellFields(cell, baseCell, session.draft, base).length > 0 ? "changed" : "same";
}

function toMarks(database: TextPart | null | undefined, submitted: TextPart | null | undefined): FieldMark[] {
  const marks: FieldMark[] = [];
  if (database !== undefined) marks.push({ tone: "database", value: database });
  if (submitted !== undefined) marks.push({ tone: "submitted", value: submitted });
  return marks.length === 0 ? NO_MARKS : marks;
}

function buildCellRowState(session: EditSession, context: ChangeContext, cell: CellDraft): CellRowState {
  const { draft, live, proposed } = session;
  const liveCell = live === null ? undefined : findCell(live, cell.key);
  const proposedCell = proposed === null ? undefined : findCell(proposed, cell.key);
  const hasLiveCell = live !== null && liveCell !== undefined;
  const hasProposedCell = proposed !== null && proposedCell !== undefined;
  const changed = hasLiveCell ? listChangedCellFields(cell, liveCell, draft, live) : [];
  const corrected = hasProposedCell ? listChangedCellFields(cell, proposedCell, draft, proposed) : [];
  const submitted = hasLiveCell && hasProposedCell ? listChangedCellFields(proposedCell, liveCell, proposed, live) : null;
  const fields: CellRowState["fields"] = {};

  for (const field of new Set([...changed, ...corrected])) {
    const isChanged = changed.includes(field);
    const isCorrected = corrected.includes(field);
    const old = isChanged && hasLiveCell ? describeCellValue(liveCell, field, live, context) : null;
    const sent = isCorrected && hasProposedCell ? describeCellValue(proposedCell, field, proposed, context) : null;
    const isSentShown = sent !== null && (submitted === null || submitted.includes(field));
    fields[field] = { isChanged, isCorrected, marks: toMarks(old ?? undefined, isSentShown ? sent : undefined) };
  }
  return { kind: getRowKind(session, cell), fields };
}

function isFreshRowState(
  known: CachedRowState,
  session: EditSession,
  context: ChangeContext,
  sectorDegrees: number | null,
  isAreaShared: boolean,
): boolean {
  return (
    known.live === session.live &&
    known.proposed === session.proposed &&
    known.sectorDegrees === sectorDegrees &&
    known.isAreaShared === isAreaShared &&
    known.context === context
  );
}

export function getCellRowState(session: EditSession, context: ChangeContext, cell: CellDraft): CellRowState {
  const { live, proposed, draft } = session;
  const sectorDegrees = getSectorDegrees(draft, cell.sectorKey);
  const isAreaShared = draft.areaCodes[cell.rat].mode === "shared";
  const known = rowStates.get(cell);
  if (known !== undefined && isFreshRowState(known, session, context, sectorDegrees, isAreaShared)) return known.state;

  const state = buildCellRowState(session, context, cell);
  rowStates.set(cell, { live, proposed, sectorDegrees, isAreaShared, context, state });
  return state;
}

function getSectorRowKind(isInDatabase: boolean, isChanged: boolean): RowKind {
  if (!isInDatabase) return "new";
  return isChanged ? "changed" : "same";
}

function buildSectorRowState(session: EditSession, sector: SectorDraft): SectorRowState {
  const entry = listSectorEntries(session.draft.sectors).find((candidate) => candidate.rowKey === sector.key);
  const liveEntries = listSectorEntries((session.live ?? EMPTY_SNAPSHOT).sectors);
  const liveEntry = entry === undefined ? undefined : findEntry(liveEntries, entry);
  const proposedEntries = session.proposed === null ? null : listSectorEntries(session.proposed.sectors);
  const proposedEntry = entry === undefined || proposedEntries === null ? undefined : findEntry(proposedEntries, entry);
  const isChanged = entry !== undefined && liveEntry !== undefined && liveEntry.degrees !== entry.degrees;
  const isCorrected = proposedEntries !== null && (proposedEntry === undefined || proposedEntry.degrees !== entry?.degrees);
  const isSentShown = isCorrected && proposedEntry !== undefined && proposedEntry.degrees !== liveEntry?.degrees;
  const old = isChanged && liveEntry !== undefined ? toDegreesPart(liveEntry.degrees) : undefined;
  const sent = isSentShown && proposedEntry !== undefined ? toDegreesPart(proposedEntry.degrees) : undefined;
  const kind = getSectorRowKind(liveEntry !== undefined, isChanged);

  return { kind, field: { isChanged, isCorrected, marks: toMarks(old, sent) } };
}

export function getSectorRowState(session: EditSession, sector: SectorDraft): SectorRowState {
  const { live, proposed } = session;
  const { sectors } = session.draft;
  const known = sectorStates.get(sector);
  if (known !== undefined && known.live === live && known.proposed === proposed && known.sectors === sectors) return known.state;

  const state = buildSectorRowState(session, sector);
  sectorStates.set(sector, { live, proposed, sectors, state });
  return state;
}

function getSpecState<Field>(
  session: EditSession,
  context: ChangeContext,
  spec: FieldSpec<Field>,
  differs: (draft: StationSnapshot, base: StationSnapshot) => boolean,
): FieldState {
  const { draft, live, proposed } = session;
  const isChanged = live !== null && differs(draft, live);
  const isCorrected = proposed !== null && differs(draft, proposed);
  if (!isChanged && !isCorrected) return UNCHANGED_FIELD;

  const old = isChanged && live !== null ? spec.describe(live, context) : undefined;
  const isSentShown = isCorrected && proposed !== null && spec.read(proposed) !== spec.read(live ?? EMPTY_SNAPSHOT);
  const sent = isSentShown && proposed !== null ? spec.describe(proposed, context) : undefined;
  return { isChanged, isCorrected, marks: toMarks(old, sent) };
}

function getAreaCodeState(session: EditSession, rat: Rat): FieldState {
  const { draft, live, proposed } = session;
  const isChanged = live !== null && isAreaCodeChanged(rat, draft, live);
  const isCorrected = proposed !== null && isAreaCodeChanged(rat, draft, proposed);
  if (!isChanged && !isCorrected) return UNCHANGED_FIELD;

  const old = isChanged && live !== null ? describeAreaCode(live.areaCodes[rat]) : undefined;
  const sent = isCorrected && proposed !== null ? describeAreaCode(proposed.areaCodes[rat]) : undefined;
  return { isChanged, isCorrected, marks: toMarks(old, sent) };
}

export function getFieldState(session: EditSession, context: ChangeContext, target: FieldTarget): FieldState {
  if (target.scope === "station") {
    const spec = STATION_SPECS.find((candidate) => candidate.field === target.field);
    return spec === undefined ? UNCHANGED_FIELD : getSpecState(session, context, spec, (draft, base) => spec.read(draft) !== spec.read(base));
  }
  if (target.scope === "place") {
    const spec = PLACE_SPECS.find((candidate) => candidate.field === target.field);
    return spec === undefined ? UNCHANGED_FIELD : getSpecState(session, context, spec, (draft, base) => differsInPlace(spec, draft, base));
  }
  if (target.scope === "areaCode") return target.rat === undefined ? UNCHANGED_FIELD : getAreaCodeState(session, target.rat);
  if (target.scope === "sector") {
    const sector = session.draft.sectors.find((candidate) => candidate.key === target.key);
    return sector === undefined ? UNCHANGED_FIELD : getSectorRowState(session, sector).field;
  }
  if (target.scope !== "cell" || target.key === undefined || target.field === undefined) return UNCHANGED_FIELD;

  const cell = findCell(session.draft, target.key);
  if (cell === undefined) return UNCHANGED_FIELD;
  const { fields }: { fields: Partial<Record<string, FieldState>> } = getCellRowState(session, context, cell);
  return fields[target.field] ?? UNCHANGED_FIELD;
}

export function countCells(session: EditSession): Record<Rat, RatCounters> {
  const counters: Record<Rat, RatCounters> = {
    nr: { total: 0, added: 0, changed: 0, deleted: 0 },
    lte: { total: 0, added: 0, changed: 0, deleted: 0 },
    umts: { total: 0, added: 0, changed: 0, deleted: 0 },
    gsm: { total: 0, added: 0, changed: 0, deleted: 0 },
  };

  for (const cell of session.draft.cells) {
    const counter = counters[cell.rat];
    const kind = getRowKind(session, cell);
    if (kind !== "deleted") counter.total += 1;
    if (kind === "new") counter.added += 1;
    if (kind === "changed") counter.changed += 1;
    if (kind === "deleted") counter.deleted += 1;
  }
  return counters;
}

export function countDraftCells(counters: Record<Rat, RatCounters>): number {
  return RAT_ORDER.reduce((total, rat) => total + counters[rat].total, 0);
}

export function getSectorCellCounts(snapshot: StationSnapshot): Map<DraftKey, number> {
  const counts = new Map<DraftKey, number>();
  for (const cell of snapshot.cells) {
    if (cell.isDeleted || cell.sectorKey === null) continue;
    counts.set(cell.sectorKey, (counts.get(cell.sectorKey) ?? 0) + 1);
  }
  return counts;
}

export function getSuggestedSectorCount(snapshot: StationSnapshot): number {
  const counts = new Map<number, number>();
  for (const cell of snapshot.cells) {
    if (cell.isDeleted || cell.bandId === null) continue;
    counts.set(cell.bandId, (counts.get(cell.bandId) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

function toPhotoItem(field: "uploads" | "picks" | "mainPhoto", kind: ChangeItem["kind"], label: TextPart): ChangeItem {
  return plainItem("photos", { scope: "photos", field }, kind, [label]);
}

export function buildPhotoChanges({ addedCount, shownCount, hiddenCount, hasNewMainPhoto }: PhotoChangeCounts): ChangeItem[] {
  const items: ChangeItem[] = [];

  if (addedCount > 0) items.push(toPhotoItem("uploads", "added", { key: "stations:edit.changes.photosAdded", values: { count: addedCount } }));
  if (shownCount > 0) items.push(toPhotoItem("picks", "added", { key: "stations:edit.changes.photosShown", values: { count: shownCount } }));
  if (hiddenCount > 0) items.push(toPhotoItem("picks", "removed", { key: "stations:edit.changes.photosHidden", values: { count: hiddenCount } }));
  if (hasNewMainPhoto) items.push(toPhotoItem("mainPhoto", "changed", { key: "stations:edit.changes.mainPhoto" }));
  return items;
}
