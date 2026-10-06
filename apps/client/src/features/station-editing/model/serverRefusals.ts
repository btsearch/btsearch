import { findCell, getAreaValue } from "./changes";
import { CELL_FLAG_LABELS, findNumberFieldSpec, getAreaCodeField, getCellNumber, isCellFlagField, isCellNumberField } from "./ratFields";
import { toCellKey } from "./snapshots";
import type { CellDraft, CellNumberField, DraftKey, EditError, EditField, EditSession, FieldTarget, Rat, TextValues } from "./types";

export type BuiltKeys = {
  body?: unknown;
  cellKeys: readonly DraftKey[];
  sectorKeys: readonly DraftKey[];
};

export type RefusalText = { messageKey: string; values?: TextValues };
export type ListedRefusal = { code: string; message: string; fields: { path: string; message: string }[] };

type Refusal = { code: string; message: string; details: readonly unknown[] };
type MatchedRefusal = { text: RefusalText; findTargets: (session: EditSession) => FieldTarget[] };
type InvalidField = { path: string; message: string };
type TargetFinder = (match: RegExpExecArray, session: EditSession) => FieldTarget[];
type ValueReader = (match: RegExpExecArray) => TextValues;
type NumberPair = readonly [field: CellNumberField, group: number];

type RefusalRule = {
  pattern: RegExp;
  messageKey: string;
  findTargets: TargetFinder;
  readValues?: ValueReader;
};

export const VALIDATION_CODE = "VALIDATION_ERROR";
export const PATH_SEPARATOR = "/";
export const INDEX_PATTERN = /^\d+$/;

const NSA_MESSAGE = /must not be set for an NR NSA cell$/;
const OWN_ADDRESS_MESSAGE = /^Address must not contain variants of/;
const OWN_ADDRESS_KEY = "common:validation.addressOwnWordForbidden";
const OWNER_PROPOSAL_PATH = /^(?:\d+\/)?location\/structure\/ownerName$/;
const RAT_BY_NAME: Partial<Record<string, Rat>> = { GSM: "gsm", UMTS: "umts", LTE: "lte", NR: "nr" };
const NUMBER_FIELD_BY_LABEL: Partial<Record<string, CellNumberField>> = {
  LAC: "lac",
  CID: "cid",
  RNC: "rnc",
  eNBID: "enbid",
  CLID: "clid",
  TAC: "tac",
  "gNB ID": "gnbid",
  EARFCN: "earfcn",
  UARFCN: "uarfcn",
  ARFCN: "arfcn",
};
const CODE_KEYS: Partial<Record<string, string>> = {
  FEATURE_DISABLED: "stations:edit.refusals.featureDisabled",
  INSUFFICIENT_PERMISSIONS: "stations:edit.refusals.forbidden",
  FORBIDDEN: "stations:edit.refusals.forbidden",
  DUPLICATE_ENTRY: "stations:edit.refusals.duplicateEntry",
};
const STATION_PATH_FIELDS: Partial<Record<string, EditField>> = {
  siteId: "siteId",
  operatorId: "operatorId",
  notes: "notes",
  status: "status",
  isConfirmed: "isConfirmed",
};
const BACKHAUL_PATH_FIELDS: Partial<Record<string, EditField>> = {
  medium: "backhaulMedium",
  speedMbps: "backhaulSpeedMbps",
  model: "backhaulModel",
};
const LOCATION_PATH_FIELDS: Partial<Record<string, EditField>> = {
  latitude: "coordinates",
  longitude: "coordinates",
  regionId: "regionId",
  region_id: "regionId",
  city: "city",
  address: "address",
  move: "move",
  structure_type: "structureType",
  structure_owner_id: "structureOwner",
  structure_owner_name: "structureOwner",
  structure_note: "structureNote",
};
const STRUCTURE_PATH_FIELDS: Partial<Record<string, EditField>> = {
  type: "structureType",
  ownerId: "structureOwner",
  ownerName: "structureOwner",
  note: "structureNote",
};
const PHOTO_PATH_FIELDS: Partial<Record<string, EditField>> = {
  uploadCount: "uploads",
  selectIds: "picks",
  removeIds: "picks",
  mainPhotoId: "mainPhoto",
};
const CELL_PATH_FIELDS: Partial<Record<string, EditField>> = {
  bandId: "bandId",
  sectorId: "sectorKey",
  sectorKey: "sectorKey",
  cellType: "cellType",
  notes: "notes",
  isConfirmed: "isConfirmed",
  mode: "mode",
};

function readGroup(match: RegExpExecArray, index: number): string {
  return match[index] ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRefusal(entry: unknown): Refusal[] {
  if (!isRecord(entry) || typeof entry.message !== "string") return [];
  const code = typeof entry.code === "string" ? entry.code : "";
  return [{ code, message: entry.message, details: Array.isArray(entry.details) ? entry.details : [] }];
}

function readRefusals(error: unknown): Refusal[] {
  if (!isRecord(error) || !Array.isArray(error.errors)) return [];
  return error.errors.flatMap(toRefusal);
}

export function isServerRefusal(error: unknown): boolean {
  return readRefusals(error).length > 0;
}

function toInvalidField(detail: unknown): InvalidField[] {
  if (!isRecord(detail) || typeof detail.field !== "string") return [];
  return [{ path: detail.field, message: typeof detail.validationMessage === "string" ? detail.validationMessage : "" }];
}

function toCellTarget(session: EditSession, cell: CellDraft, field?: EditField): FieldTarget {
  const areaField = getAreaCodeField(cell.rat);
  if (field === areaField && session.draft.areaCodes[cell.rat].mode === "shared") return { scope: "areaCode", rat: cell.rat, field: areaField };
  return field === undefined ? { scope: "cell", key: cell.key, rat: cell.rat } : { scope: "cell", key: cell.key, rat: cell.rat, field };
}

function listKeptCells(session: EditSession, rat?: Rat): CellDraft[] {
  return session.draft.cells.filter((cell) => !cell.isDeleted && (rat === undefined || cell.rat === rat));
}

function readNumber(session: EditSession, cell: CellDraft, field: CellNumberField): number {
  const value = field === getAreaCodeField(cell.rat) ? getAreaValue(session.draft, cell) : getCellNumber(cell, field);
  return value ?? 0;
}

function atStation(field: EditField): TargetFinder {
  return () => [{ scope: "station", field }];
}

function atPlace(field: EditField): TargetFinder {
  return () => [{ scope: "place", field }];
}

function atPhotos(field: EditField): TargetFinder {
  return () => [{ scope: "photos", field }];
}

function atSectors(): FieldTarget[] {
  return [{ scope: "sector" }];
}

function atGeneral(): FieldTarget[] {
  return [{ scope: "general" }];
}

function atCells(): FieldTarget[] {
  return [{ scope: "cell" }];
}

function atRat(rat: Rat): TargetFinder {
  return () => [{ scope: "cell", rat }];
}

function atCellId(group: number): TargetFinder {
  return (match, session) => {
    const cell = findCell(session.draft, toCellKey(Number(readGroup(match, group))));
    return cell === undefined ? atCells() : [toCellTarget(session, cell)];
  };
}

function atCellsWith(rat: Rat | number, pairs: readonly NumberPair[], field: CellNumberField): TargetFinder {
  return (match, session) => {
    const wantedRat = typeof rat === "number" ? RAT_BY_NAME[readGroup(match, rat)] : rat;
    if (wantedRat === undefined) return atCells();

    const cells = listKeptCells(session, wantedRat).filter((cell) =>
      pairs.every(([pairField, group]) => readNumber(session, cell, pairField) === Number(readGroup(match, group))),
    );
    return cells.length === 0 ? [{ scope: "cell", rat: wantedRat }] : cells.map((cell) => toCellTarget(session, cell, field));
  };
}

function atCellsWithBand(group: number): TargetFinder {
  return (match, session) => {
    const cells = listKeptCells(session).filter((cell) => cell.bandId === Number(readGroup(match, group)));
    return cells.length === 0 ? atCells() : cells.map((cell) => toCellTarget(session, cell, "bandId"));
  };
}

function atChannel(labelGroup: number, valueGroup: number): TargetFinder {
  return (match, session) => {
    const field = NUMBER_FIELD_BY_LABEL[readGroup(match, labelGroup)];
    if (field === undefined) return atCells();

    const cells = listKeptCells(session).filter((cell) => getCellNumber(cell, field) === Number(readGroup(match, valueGroup)));
    return cells.length === 0 ? atCells() : cells.map((cell) => toCellTarget(session, cell, field));
  };
}

function atMisplacedField(fieldGroup: number, cellGroup: number): TargetFinder {
  return (match, session) => {
    const cell = findCell(session.draft, toCellKey(Number(readGroup(match, cellGroup))));
    const field = readGroup(match, fieldGroup);
    if (cell === undefined) return atCells();
    return [toCellTarget(session, cell, isCellNumberField(field) || isCellFlagField(field) ? field : undefined)];
  };
}

function atSiteSwitch(match: RegExpExecArray, session: EditSession): FieldTarget[] {
  const field = readGroup(match, 1) === "psc" ? "psc" : "bsic";
  const cells = listKeptCells(session).filter((cell) => getCellNumber(cell, field) !== null);
  return cells.length === 0 ? atGeneral() : cells.map((cell) => toCellTarget(session, cell, field));
}

function readMessage(match: RegExpExecArray): TextValues {
  return { message: readGroup(match, 0) };
}

const REFUSAL_RULES: readonly RefusalRule[] = [
  { pattern: /^Sector \d+ does not belong to this station$/, messageKey: "stations:edit.refusals.sectorGone", findTargets: atSectors },
  { pattern: /^Cell (\d+) does not exist on this station$/, messageKey: "stations:edit.refusals.cellGone", findTargets: atCellId(1) },
  { pattern: /^Target cell (\d+) not found$/, messageKey: "stations:edit.refusals.cellGone", findTargets: atCellId(1) },
  {
    pattern: /^(\w+) does not apply to cell (\d+), which is (\w+)$/,
    messageKey: "stations:edit.refusals.fieldNotForRat",
    findTargets: atMisplacedField(1, 2),
    readValues: (match) => ({ field: readGroup(match, 1), rat: readGroup(match, 3) }),
  },
  { pattern: /^Cell (\d+) cannot be changed through a submission$/, messageKey: "stations:edit.refusals.cellNotEditable", findTargets: atCellId(1) },
  {
    pattern: /^(psc|bsic) is not kept on this site$/,
    messageKey: "stations:edit.errors.codeDisabled",
    findTargets: atSiteSwitch,
    readValues: (match) => ({ field: readGroup(match, 1).toUpperCase() }),
  },
  {
    pattern: /^RNC and CID are unknown together/,
    messageKey: "stations:edit.refusals.unknownTogether",
    findTargets: atRat("umts"),
    readValues: () => ({ node: "RNC", cell: "CID" }),
  },
  {
    pattern: /^eNB ID and CLID are unknown together/,
    messageKey: "stations:edit.refusals.unknownTogether",
    findTargets: atRat("lte"),
    readValues: () => ({ node: "eNBID", cell: "CLID" }),
  },
  { pattern: /^Operator \d+ does not exist$/, messageKey: "stations:edit.refusals.operatorGone", findTargets: atStation("operatorId") },
  { pattern: /^Region \d+ does not exist$/, messageKey: "stations:edit.refusals.regionGone", findTargets: atPlace("regionId") },
  { pattern: /^One or more bands do not exist$/, messageKey: "stations:edit.refusals.bandGone", findTargets: atCells },
  { pattern: /^Band (\d+) does not exist$/, messageKey: "stations:edit.refusals.bandGone", findTargets: atCellsWithBand(1) },
  {
    pattern: /^No region could be worked out for these coordinates/,
    messageKey: "stations:edit.refusals.regionUnknown",
    findTargets: atPlace("regionId"),
  },
  { pattern: /^Structure owner \d+ does not exist$/, messageKey: "stations:edit.refusals.ownerGone", findTargets: atPlace("structureOwner") },
  {
    pattern: /^The structure owner belongs to another country than the location$/,
    messageKey: "stations:edit.refusals.ownerOtherCountry",
    findTargets: atPlace("structureOwner"),
  },
  {
    pattern: /^An? (TAC|CLID|gNB ID) must not be set for an NR NSA cell$/,
    messageKey: "stations:edit.errors.nsaField",
    findTargets: atRat("nr"),
    readValues: (match) => ({ field: readGroup(match, 1).replace(" ", "") }),
  },
  {
    pattern: /^RedCap support must not be set for an NR NSA cell$/,
    messageKey: "stations:edit.errors.nsaField",
    findTargets: atRat("nr"),
    readValues: () => ({ field: CELL_FLAG_LABELS.supportsRedCap }),
  },
  { pattern: /^A new station needs a station ID$/, messageKey: "stations:edit.errors.siteIdRequired", findTargets: atStation("siteId") },
  {
    pattern: /^(A new station's uplink speed needs an uplink type|medium is required for a new station's backhaul)$/,
    messageKey: "stations:edit.errors.backhaulMediumRequired",
    findTargets: atStation("backhaulMedium"),
  },
  {
    pattern: /^(operator_id is required for new stations|siteId and operatorId are required for a new station)$/,
    messageKey: "stations:edit.errors.operatorRequired",
    findTargets: atStation("operatorId"),
  },
  {
    pattern: /^A region and coordinates are required/,
    messageKey: "stations:edit.refusals.locationIncomplete",
    findTargets: atPlace("coordinates"),
  },
  {
    pattern: /^Proposed location is missing a region or coordinates$/,
    messageKey: "stations:edit.refusals.locationIncomplete",
    findTargets: atPlace("regionId"),
  },
  {
    pattern: /^A station with (this|the proposed) station ID and operator already exists/,
    messageKey: "stations:edit.refusals.siteIdTaken",
    findTargets: atStation("siteId"),
  },
  {
    pattern: /^The station is already registered at this location$/,
    messageKey: "stations:edit.refusals.alreadyAtLocation",
    findTargets: atPlace("coordinates"),
  },
  { pattern: /^Azimuth values must be unique$/, messageKey: "stations:edit.refusals.azimuthsNotUnique", findTargets: atSectors },
  {
    pattern: /^A station can have at most (\d+) sectors$/,
    messageKey: "stations:edit.errors.tooManyAzimuths",
    findTargets: atSectors,
    readValues: (match) => ({ max: Number(readGroup(match, 1)) }),
  },
  { pattern: /^Cannot delete sectors that still have cells assigned$/, messageKey: "stations:edit.refusals.sectorHasCells", findTargets: atSectors },
  { pattern: /^One or more cells are assigned to a /, messageKey: "stations:edit.refusals.cellSectorInvalid", findTargets: atSectors },
  {
    pattern: /^(A sector can be listed only once|One or more sectors do not belong to this station|Each sector can only be changed once)$/,
    messageKey: "stations:edit.refusals.sectorsRefused",
    findTargets: atSectors,
    readValues: readMessage,
  },
  {
    pattern: /^(A new sector cannot point at|An updated or deleted sector must be|Every sector change must say)/,
    messageKey: "stations:edit.refusals.sectorsRefused",
    findTargets: atSectors,
    readValues: readMessage,
  },
  {
    pattern: /^Duplicate LAC\+CID \((\d+)\+(\d+)\) found in GSM cells$/,
    messageKey: "stations:edit.errors.cellIdentityDuplicate",
    findTargets: atCellsWith(
      "gsm",
      [
        ["lac", 1],
        ["cid", 2],
      ],
      "cid",
    ),
    readValues: () => ({ fields: "LAC + CID" }),
  },
  {
    pattern: /^Duplicate RNC\+CID \((\d+)\+(\d+)\) found in UMTS cells$/,
    messageKey: "stations:edit.errors.cellIdentityDuplicate",
    findTargets: atCellsWith(
      "umts",
      [
        ["rnc", 1],
        ["cid", 2],
      ],
      "cid",
    ),
    readValues: () => ({ fields: "RNC + CID" }),
  },
  {
    pattern: /^Duplicate eNBID\+CLID \((\d+)\+(\d+)\) found in LTE cells$/,
    messageKey: "stations:edit.errors.cellIdentityDuplicate",
    findTargets: atCellsWith(
      "lte",
      [
        ["enbid", 1],
        ["clid", 2],
      ],
      "clid",
    ),
    readValues: () => ({ fields: "eNBID + CLID" }),
  },
  {
    pattern: /^Duplicate PCI (\d+) found on the same band in (LTE|NR) cells$/,
    messageKey: "stations:edit.errors.pciDuplicate",
    findTargets: atCellsWith(2, [["pci", 1]], "pci"),
    readValues: (match) => ({ pci: Number(readGroup(match, 1)) }),
  },
  { pattern: /^Band (\d+) is for \w+ cells, not \w+$/, messageKey: "stations:edit.refusals.bandWrongRat", findTargets: atCellsWithBand(1) },
  { pattern: /^Band (\d+) is not in the band plan of [A-Z]{2}$/, messageKey: "stations:edit.errors.bandNotInPlan", findTargets: atCellsWithBand(1) },
  {
    pattern: /^(EARFCN|UARFCN|ARFCN) (\d+) is not valid for /,
    messageKey: "stations:edit.errors.channelBandMismatch",
    findTargets: atChannel(1, 2),
    readValues: (match) => ({ field: readGroup(match, 1) }),
  },
  {
    pattern: /^A GSM cell with LAC (\d+) and CID (\d+) already exists for this operator$/,
    messageKey: "stations:edit.refusals.cellIdentityTaken",
    findTargets: atCellsWith(
      "gsm",
      [
        ["lac", 1],
        ["cid", 2],
      ],
      "cid",
    ),
    readValues: (match) => ({ fields: "LAC + CID", values: `${readGroup(match, 1)} + ${readGroup(match, 2)}` }),
  },
  {
    pattern: /^A UMTS cell with RNC (\d+) and CID (\d+) already exists for this operator$/,
    messageKey: "stations:edit.refusals.cellIdentityTaken",
    findTargets: atCellsWith(
      "umts",
      [
        ["rnc", 1],
        ["cid", 2],
      ],
      "cid",
    ),
    readValues: (match) => ({ fields: "RNC + CID", values: `${readGroup(match, 1)} + ${readGroup(match, 2)}` }),
  },
  {
    pattern: /^An LTE cell with eNBID (\d+) and CLID (\d+) already exists for this operator$/,
    messageKey: "stations:edit.refusals.cellIdentityTaken",
    findTargets: atCellsWith(
      "lte",
      [
        ["enbid", 1],
        ["clid", 2],
      ],
      "clid",
    ),
    readValues: (match) => ({ fields: "eNBID + CLID", values: `${readGroup(match, 1)} + ${readGroup(match, 2)}` }),
  },
  {
    pattern: /^An (LTE|NR) cell with PCI (\d+) already exists for this station using the same band/,
    messageKey: "stations:edit.refusals.pciTaken",
    findTargets: atCellsWith(1, [["pci", 2]], "pci"),
    readValues: (match) => ({ pci: Number(readGroup(match, 2)) }),
  },
  { pattern: /^A cell can be changed once per /, messageKey: "stations:edit.refusals.cellListedTwice", findTargets: atCells },
  { pattern: /^No changes detected/, messageKey: "stations:edit.refusals.noChanges", findTargets: () => [{ scope: "general", field: "changes" }] },
  { pattern: /^Target cell (\d+) is on another station$/, messageKey: "stations:edit.refusals.cellMoved", findTargets: atCellId(1) },
  {
    pattern: /^A cell's technology cannot be changed; cell (\d+) is /,
    messageKey: "stations:edit.refusals.cellRatChanged",
    findTargets: atCellId(1),
  },
  {
    pattern: /^This operator's stations take (only the operatorName identifier|no identifiers)$/,
    messageKey: "stations:edit.refusals.identifiersNotTaken",
    findTargets: atStation("identifiers"),
  },
  {
    pattern: /^(This submission has (already|just) been reviewed|Only pending submissions can be \w+|Only the review note of a reviewed submission)/,
    messageKey: "stations:edit.refusals.alreadyReviewed",
    findTargets: atGeneral,
  },
  { pattern: /^This submission was changed after you opened it$/, messageKey: "submissions:detail.staleWarning", findTargets: atGeneral },
  { pattern: /^Station not found$/, messageKey: "stations:edit.refusals.stationGone", findTargets: atGeneral },
  { pattern: /^This country is not accepting submissions$/, messageKey: "stations:edit.refusals.countryClosed", findTargets: atGeneral },
  { pattern: /^Your editor access does not cover this region$/, messageKey: "stations:edit.refusals.outsideGrant", findTargets: atGeneral },
  { pattern: /^One or more photos do not exist$/, messageKey: "stations:edit.refusals.photosGone", findTargets: atPhotos("picks") },
  {
    pattern: /^One or more photos do not belong to this station's location$/,
    messageKey: "stations:edit.refusals.photosOtherLocation",
    findTargets: atPhotos("picks"),
  },
  {
    pattern: /^One or more photos in removeIds are not shown by this station$/,
    messageKey: "stations:edit.refusals.photosNotShown",
    findTargets: atPhotos("picks"),
  },
  {
    pattern: /^At least one photo is required when submitting a new station without cells$/,
    messageKey: "submissions:validation.pendingStationPhotoRequired",
    findTargets: atPhotos("uploads"),
  },
  {
    pattern: /^A delete (carries no changes, only a note|cannot carry cell or sector changes)$/,
    messageKey: "stations:edit.refusals.deleteOnlyNote",
    findTargets: atGeneral,
  },
  { pattern: OWN_ADDRESS_MESSAGE, messageKey: OWN_ADDRESS_KEY, findTargets: atPlace("address") },
];

function toErrors(targets: readonly FieldTarget[], messageKey: string, values?: TextValues): EditError[] {
  return targets.map((target) => {
    const error: EditError = { target, messageKey };
    if (values !== undefined) error.values = values;
    return error;
  });
}

function matchRefusal(refusal: Pick<Refusal, "code" | "message">): MatchedRefusal {
  for (const rule of REFUSAL_RULES) {
    const match = rule.pattern.exec(refusal.message);
    if (match === null) continue;

    const text: RefusalText = { messageKey: rule.messageKey };
    const values = rule.readValues?.(match);
    if (values !== undefined) text.values = values;
    return { text, findTargets: (session) => rule.findTargets(match, session) };
  }

  const codeKey = CODE_KEYS[refusal.code];
  if (codeKey !== undefined) return { text: { messageKey: codeKey }, findTargets: atGeneral };
  return { text: { messageKey: "stations:edit.refusals.unknown", values: { message: refusal.message } }, findTargets: atGeneral };
}

function toMessageErrors(refusal: Refusal, session: EditSession): EditError[] {
  const { text, findTargets } = matchRefusal(refusal);
  return toErrors(findTargets(session), text.messageKey, text.values);
}

function readBodyIdentifierKind(body: unknown, index: number): EditField {
  const item = Array.isArray(body) ? body.at(0) : body;
  const station = isRecord(item) ? item.station : undefined;
  const identifiers = isRecord(station) && Array.isArray(station.identifiers) ? station.identifiers : [];
  const identifier: unknown = identifiers.at(index);
  const kind = isRecord(identifier) ? identifier.kind : undefined;
  return kind === "networksId" || kind === "networksName" || kind === "operatorName" ? kind : "identifiers";
}

function toStationPathTarget(segments: readonly string[], built: BuiltKeys | null): FieldTarget {
  const [, part = "", index = "", leaf = ""] = segments;
  if (part === "identifiers") return { scope: "station", field: readBodyIdentifierKind(built?.body, Number(index)) };

  const field = part === "backhaul" ? (BACKHAUL_PATH_FIELDS[index] ?? "backhaulMedium") : (STATION_PATH_FIELDS[part] ?? STATION_PATH_FIELDS[leaf]);
  return field === undefined ? { scope: "station" } : { scope: "station", field };
}

function toLocationPathTarget(segments: readonly string[]): FieldTarget {
  const [, part = "", leaf = ""] = segments;
  const field = part === "structure" ? (STRUCTURE_PATH_FIELDS[leaf] ?? "structureType") : (LOCATION_PATH_FIELDS[part] ?? "coordinates");
  return { scope: "place", field };
}

function toCellPathTarget(segments: readonly string[], built: BuiltKeys | null, session: EditSession): FieldTarget {
  const [, index = "", leaf = ""] = segments;
  const key = INDEX_PATTERN.test(index) ? built?.cellKeys.at(Number(index)) : undefined;
  const cell = key === undefined ? undefined : findCell(session.draft, key);
  if (cell === undefined) return { scope: "cell" };

  const field = isCellNumberField(leaf) || isCellFlagField(leaf) ? leaf : CELL_PATH_FIELDS[leaf];
  return toCellTarget(session, cell, field);
}

function toSectorPathTarget(segments: readonly string[], built: BuiltKeys | null): FieldTarget {
  const [, index = ""] = segments;
  const key = INDEX_PATTERN.test(index) ? built?.sectorKeys.at(Number(index)) : undefined;
  return key === undefined ? { scope: "sector" } : { scope: "sector", key, field: "degrees" };
}

function toPathTarget(path: string, built: BuiltKeys | null, session: EditSession): FieldTarget {
  const parts = path.split(PATH_SEPARATOR).filter((segment) => segment !== "");
  const [first = ""] = parts;
  const segments = INDEX_PATTERN.test(first) ? parts.slice(1) : parts;
  const [root = "", leaf = ""] = segments;

  if (root === "cells") return toCellPathTarget(segments, built, session);
  if (root === "sectors") return toSectorPathTarget(segments, built);
  if (root === "station") return toStationPathTarget(segments, built);
  if (root === "location") return toLocationPathTarget(segments);
  if (root === "photos") return { scope: "photos", field: PHOTO_PATH_FIELDS[leaf] ?? "picks" };
  if (root === "note" || root === "reviewNote") return { scope: "general", field: "note" };
  return { scope: "general" };
}

function toInvalidFieldError(invalid: InvalidField, built: BuiltKeys | null, session: EditSession): EditError {
  const target = toPathTarget(invalid.path, built, session);
  const { field, rat } = target;
  const { message } = invalid;
  const spec = rat !== undefined && field !== undefined && isCellNumberField(field) ? findNumberFieldSpec(rat, field) : null;

  if (OWN_ADDRESS_MESSAGE.test(message)) return { target, messageKey: OWN_ADDRESS_KEY };
  if (spec !== null && NSA_MESSAGE.test(message)) return { target, messageKey: "stations:edit.errors.nsaField", values: { field: spec.label } };
  if (spec !== null) return { target, messageKey: "stations:edit.errors.range", values: { field: spec.label, max: spec.max } };
  return { target, messageKey: "stations:edit.refusals.invalidField", values: { message } };
}

function toRefusalErrors(refusal: Refusal, built: BuiltKeys | null, session: EditSession): EditError[] {
  if (refusal.code === "FEATURE_DISABLED") {
    const ownerFields = refusal.details.flatMap(toInvalidField).filter((invalid) => OWNER_PROPOSAL_PATH.test(invalid.path));
    if (ownerFields.length > 0)
      return toErrors(
        ownerFields.map((invalid) => toPathTarget(invalid.path, built, session)),
        "stations:edit.refusals.featureDisabled",
      );
  }

  const invalidFields = refusal.code === VALIDATION_CODE ? refusal.details.flatMap(toInvalidField) : [];
  if (invalidFields.length === 0) return toMessageErrors(refusal, session);
  return invalidFields.map((invalid) => toInvalidFieldError(invalid, built, session));
}

export function toEditErrors(error: unknown, built: BuiltKeys | null, session: EditSession): EditError[] {
  return readRefusals(error).flatMap((refusal) => toRefusalErrors(refusal, built, session));
}

export function findRefusalText(refusal: { code: string; message: string }): RefusalText {
  return matchRefusal(refusal).text;
}

export function listRefusals(error: unknown): ListedRefusal[] {
  return readRefusals(error).map((refusal) => ({ code: refusal.code, message: refusal.message, fields: refusal.details.flatMap(toInvalidField) }));
}
