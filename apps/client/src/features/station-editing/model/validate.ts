import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { isChannelValidForBand } from "@openbts/shared/bandCatalog";
import type { Band, Operator, StationIdentifierKind } from "@openbts/shared/contract";
import { EXTRA_IDENTIFICATORS_MNCS, MNO_NAME_ONLY_MNCS } from "@openbts/shared/operatorUtils";

import { countCellEntries } from "./bodies";
import { getAreaValue, getRowKind, normalizeText } from "./changes";
import {
  CELL_FLAG_LABELS,
  CELL_NUMBER_LABELS,
  GNBID_MAX_LENGTH,
  GNBID_MIN_LENGTH,
  MAX_CELL_CHANGES,
  MAX_SECTORS,
  OMNIDIRECTIONAL_DEGREES,
  RAT_FIELDS,
  RAT_ORDER,
  carriesAreaCode,
  getAreaCodeField,
  getAreaCodeMax,
  getCellFlag,
  getCellNumber,
  getCellNumberMax,
} from "./ratFields";
import { IDENTIFIER_KINDS } from "./snapshots";
import type {
  CellDraft,
  CellNumberField,
  DraftKey,
  EditError,
  EditField,
  EditSession,
  FieldTarget,
  PlaceDraft,
  Rat,
  SectorDraft,
  TextValues,
} from "./types";
import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import { shallowEqual } from "@/lib/shallowEqual";

type ValidationContext = {
  bandsById: ReadonlyMap<number, Band>;
  bandPlanIds: ReadonlySet<number> | null;
  countryFeatures: { psc: boolean; bsic: boolean } | null;
};

type UploadFile = {
  name: string;
  size: number;
};

type SubmissionExtrasInput = {
  session: EditSession;
  note: string;
  uploads: readonly UploadFile[];
  storedUploadCount: number;
  selectIds: readonly string[];
  removeIds: readonly string[];
  mainPhotoId: string | null;
};

type CellGroup = { keys: DraftKey[]; hasWrittenCell: boolean };
type RowScope = "cell" | "sector";

export const EDIT_LIMITS = {
  siteId: 16,
  identifier: 50,
  networksIdDigits: 9,
  backhaulModel: 100,
  backhaulSpeed: 2_147_483_647,
  city: 100,
  structureNote: 150,
  ownerName: 100,
  submissionNote: 2000,
  photoUploads: 10,
  photoPicks: 50,
  photoBytes: 20 * 1024 * 1024,
  latitude: 90,
  longitude: 180,
} as const;

export const NO_EDIT_ERRORS: EditError[] = [];

const NETWORKS_ID_PATTERN = /^\d{1,9}$/;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const OWN_NAME_KINDS: readonly StationIdentifierKind[] = ["operatorName"];
const CATALOG_RATS: Record<Rat, string> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" };

const lastGroups: Record<RowScope, ReadonlyMap<DraftKey, EditError[]>> = { cell: new Map(), sector: new Map() };

export function listIdentifierKinds(operator: Pick<Operator, "primaryPlmn"> | null): readonly StationIdentifierKind[] {
  const mnc = toV1OperatorMnc(operator);
  if (mnc === null) return [];
  if (EXTRA_IDENTIFICATORS_MNCS.includes(mnc)) return IDENTIFIER_KINDS;
  return MNO_NAME_ONLY_MNCS.includes(mnc) ? OWN_NAME_KINDS : [];
}

function toError(target: FieldTarget, messageKey: string, values?: TextValues, isQuiet = false): EditError {
  const error: EditError = { target, messageKey };
  if (values !== undefined) error.values = values;
  if (isQuiet) error.isQuiet = true;
  return error;
}

function stationTarget(field: EditField): FieldTarget {
  return { scope: "station", field };
}

function placeTarget(field: EditField): FieldTarget {
  return { scope: "place", field };
}

function cellTarget(cell: CellDraft, field: EditField): FieldTarget {
  return { scope: "cell", key: cell.key, rat: cell.rat, field };
}

function isOutOfRange(value: number, min: number, max: number): boolean {
  return !Number.isInteger(value) || value < min || value > max;
}

function validateStation(session: EditSession): EditError[] {
  const { station } = session.draft;
  const isNewStation = session.live === null;
  const siteId = normalizeText(station.siteId);
  const networksId = normalizeText(station.identifiers.networksId);
  const { medium, speedMbps, model } = station.backhaul;
  const errors: EditError[] = [];

  if (siteId === "") errors.push(toError(stationTarget("siteId"), "stations:edit.errors.siteIdRequired", undefined, isNewStation));
  if (siteId.length > EDIT_LIMITS.siteId) {
    errors.push(toError(stationTarget("siteId"), "stations:edit.errors.siteIdTooLong", { max: EDIT_LIMITS.siteId }));
  }
  if (station.operatorId === null) {
    errors.push(toError(stationTarget("operatorId"), "stations:edit.errors.operatorRequired", undefined, isNewStation));
  }
  if (networksId !== "" && !NETWORKS_ID_PATTERN.test(networksId)) {
    errors.push(toError(stationTarget("networksId"), "stations:edit.errors.networksIdInvalid", { max: EDIT_LIMITS.networksIdDigits }));
  }
  for (const kind of IDENTIFIER_KINDS) {
    if (normalizeText(station.identifiers[kind]).length <= EDIT_LIMITS.identifier) continue;
    errors.push(toError(stationTarget(kind), "stations:edit.errors.identifierTooLong", { max: EDIT_LIMITS.identifier }));
  }
  if (medium === null && speedMbps !== null) errors.push(toError(stationTarget("backhaulMedium"), "stations:edit.errors.backhaulMediumRequired"));
  if (speedMbps !== null && isOutOfRange(speedMbps, 1, EDIT_LIMITS.backhaulSpeed)) {
    errors.push(toError(stationTarget("backhaulSpeedMbps"), "stations:edit.errors.backhaulSpeedRange", { max: EDIT_LIMITS.backhaulSpeed }));
  }
  if (medium === "microwave" && normalizeText(model).length > EDIT_LIMITS.backhaulModel) {
    errors.push(toError(stationTarget("backhaulModel"), "stations:edit.errors.backhaulModelTooLong", { max: EDIT_LIMITS.backhaulModel }));
  }
  return errors;
}

function validateCoordinates(place: PlaceDraft): EditError[] {
  const { latitude, longitude } = place;
  const target = placeTarget("coordinates");
  if (latitude === null && longitude === null) return [toError(target, "stations:edit.errors.coordinatesRequired", undefined, true)];
  if (latitude === null || longitude === null) return [toError(target, "stations:edit.errors.coordinatesIncomplete")];

  const errors: EditError[] = [];
  if (Math.abs(latitude) > EDIT_LIMITS.latitude) errors.push(toError(target, "stations:edit.errors.latitudeRange"));
  if (Math.abs(longitude) > EDIT_LIMITS.longitude) errors.push(toError(target, "stations:edit.errors.longitudeRange"));
  return errors;
}

function validateOwner(session: EditSession, place: PlaceDraft): EditError[] {
  const { owner } = place.structure;
  if (owner.kind !== "proposed") return [];

  const target = placeTarget("structureOwner");
  if (session.kind === "editor") return [toError(target, "stations:edit.errors.ownerMustBeListed")];

  const { length } = normalizeText(owner.name);
  if (length > 0 && length <= EDIT_LIMITS.ownerName) return [];
  return [toError(target, "stations:edit.errors.ownerNameLength", { max: EDIT_LIMITS.ownerName })];
}

function validatePlace(session: EditSession): EditError[] {
  const { place } = session.draft;
  if (place === null) {
    return session.live === null ? [toError(placeTarget("coordinates"), "stations:edit.errors.coordinatesRequired", undefined, true)] : [];
  }

  const errors = [...validateCoordinates(place), ...validateOwner(session, place)];
  if (normalizeText(place.city).length > EDIT_LIMITS.city) {
    errors.push(toError(placeTarget("city"), "stations:edit.errors.cityTooLong", { max: EDIT_LIMITS.city }));
  }
  if (hasGenericAddressMarker(place.address)) errors.push(toError(placeTarget("address"), "common:validation.addressOwnWordForbidden"));
  if (normalizeText(place.structure.note).length > EDIT_LIMITS.structureNote) {
    errors.push(toError(placeTarget("structureNote"), "stations:edit.errors.structureNoteTooLong", { max: EDIT_LIMITS.structureNote }));
  }
  return errors;
}

function validateSectors(sectors: readonly SectorDraft[]): EditError[] {
  const errors: EditError[] = [];
  const counts = new Map<number, number>();
  for (const { degrees } of sectors) if (degrees !== null) counts.set(degrees, (counts.get(degrees) ?? 0) + 1);

  for (const sector of sectors) {
    const target: FieldTarget = { scope: "sector", key: sector.key, field: "degrees" };
    const { degrees } = sector;
    if (degrees === null) errors.push(toError(target, "stations:edit.errors.azimuthEmpty", undefined, true));
    else if (isOutOfRange(degrees, 0, OMNIDIRECTIONAL_DEGREES)) errors.push(toError(target, "stations:edit.errors.azimuthRange"));
    else if ((counts.get(degrees) ?? 0) > 1) errors.push(toError(target, "stations:edit.errors.azimuthDuplicate", { degrees }));
  }
  if (sectors.length > MAX_SECTORS) errors.push(toError({ scope: "sector" }, "stations:edit.errors.tooManyAzimuths", { max: MAX_SECTORS }));
  return errors;
}

function validateRequiredIds(session: EditSession, cell: CellDraft): EditError[] {
  const { draft } = session;
  const isNewRow = cell.id === null;
  const { nodeField, cellIdField } = RAT_FIELDS[cell.rat];
  const errors: EditError[] = [];
  const requireField = (field: CellNumberField) => {
    errors.push(toError(cellTarget(cell, field), "stations:edit.errors.required", { field: CELL_NUMBER_LABELS[field] }, isNewRow));
  };

  if (cell.bandId === null && isNewRow) errors.push(toError(cellTarget(cell, "bandId"), "stations:edit.errors.bandRequired", undefined, true));
  if (cell.rat === "nr" && cell.mode === null) {
    errors.push(toError(cellTarget(cell, "mode"), "stations:edit.errors.modeRequired", undefined, isNewRow));
  }
  if (cell.rat === "gsm" && getCellNumber(cell, "cid") === null) requireField("cid");
  if (cell.rat === "gsm" && draft.areaCodes.gsm.mode === "perCell" && getCellNumber(cell, "lac") === null) requireField("lac");
  if ((cell.rat === "umts" || cell.rat === "lte") && nodeField !== null && cellIdField !== null) {
    const node = getCellNumber(cell, nodeField);
    if (node !== null && node !== 0 && getCellNumber(cell, cellIdField) === null) requireField(cellIdField);
  }
  return errors;
}

function validateNumbers(session: EditSession, context: ValidationContext, cell: CellDraft): EditError[] {
  const spec = RAT_FIELDS[cell.rat];
  const isAreaShared = session.draft.areaCodes[cell.rat].mode === "shared";
  const errors: EditError[] = [];

  if (cell.rat === "nr" && cell.mode === "sa" && cell.gnbidLength !== null && isOutOfRange(cell.gnbidLength, GNBID_MIN_LENGTH, GNBID_MAX_LENGTH))
    errors.push(toError(cellTarget(cell, "gnbidLength"), "stations:edit.errors.gnbidLengthRange", { min: GNBID_MIN_LENGTH, max: GNBID_MAX_LENGTH }));

  for (const numberSpec of spec.numbers) {
    const { field, label, isSaOnly, siteSwitch } = numberSpec;
    const max = getCellNumberMax(cell, numberSpec);
    const value = getCellNumber(cell, field);
    if (value === null || (field === spec.areaCodeField && isAreaShared)) continue;

    const target = cellTarget(cell, field);
    if (isSaOnly && cell.mode !== "sa") errors.push(toError(target, "stations:edit.errors.nsaField", { field: label }));
    else if (isOutOfRange(value, 0, max)) errors.push(toError(target, "stations:edit.errors.range", { field: label, max }));
    if (siteSwitch !== null && context.countryFeatures?.[siteSwitch] !== true) {
      errors.push(toError(target, "stations:edit.errors.codeDisabled", { field: label }));
    }
  }
  for (const { field, isSaOnly } of spec.flags) {
    if (!isSaOnly || cell.mode === "sa" || !getCellFlag(cell, field)) continue;
    errors.push(toError(cellTarget(cell, field), "stations:edit.errors.nsaField", { field: CELL_FLAG_LABELS[field] }));
  }
  return errors;
}

function validateBand(context: ValidationContext, cell: CellDraft): EditError[] {
  if (cell.bandId === null) return [];

  const errors: EditError[] = [];
  const band = context.bandsById.get(cell.bandId);
  const { channelField } = RAT_FIELDS[cell.rat];
  const channel = channelField === null ? null : getCellNumber(cell, channelField);
  if (context.bandPlanIds !== null && !context.bandPlanIds.has(cell.bandId)) {
    errors.push(toError(cellTarget(cell, "bandId"), "stations:edit.errors.bandNotInPlan"));
  }
  if (band === undefined || band.labelMhz === null || channelField === null || channel === null) return errors;

  const duplex = band.duplex === null ? null : band.duplex.toUpperCase();
  const catalogBand = { rat: CATALOG_RATS[cell.rat], value: band.labelMhz, duplex, variant: band.variant, code: band.code };
  if (!isChannelValidForBand(catalogBand, channel)) {
    errors.push(toError(cellTarget(cell, channelField), "stations:edit.errors.channelBandMismatch", { field: CELL_NUMBER_LABELS[channelField] }));
  }
  return errors;
}

function getIdentityNode(session: EditSession, cell: CellDraft): number | null {
  if (cell.rat === "gsm") return getAreaValue(session.draft, cell);

  const { nodeField } = RAT_FIELDS[cell.rat];
  return nodeField === null ? null : getCellNumber(cell, nodeField);
}

function getIdentityKey(session: EditSession, cell: CellDraft): string | null {
  const { cellIdField } = RAT_FIELDS[cell.rat];
  if (cell.rat === "nr" || cellIdField === null) return null;

  const cellId = getCellNumber(cell, cellIdField);
  const node = getIdentityNode(session, cell);
  if (cellId === null) return null;
  if (cell.rat !== "gsm" && (node ?? 0) === 0 && cellId === 0) return null;
  return `${node ?? 0}:${cellId}`;
}

function getPciKey(cell: CellDraft): string | null {
  const pci = getCellNumber(cell, "pci");
  if ((cell.rat !== "lte" && cell.rat !== "nr") || cell.bandId === null || pci === null) return null;

  const node = cell.rat === "lte" ? `${getCellNumber(cell, "enbid") ?? 0}:` : "";
  const channel = getCellNumber(cell, cell.rat === "lte" ? "earfcn" : "arfcn");
  return `${cell.bandId}:${node}${pci}:${channel ?? ""}`;
}

function groupCells(cells: readonly CellDraft[], written: ReadonlySet<DraftKey>, getKey: (cell: CellDraft) => string | null): CellGroup[] {
  const groups = new Map<string, CellGroup>();
  for (const cell of cells) {
    const key = getKey(cell);
    if (key === null) continue;
    const group = groups.get(key) ?? { keys: [], hasWrittenCell: false };
    group.keys.push(cell.key);
    group.hasWrittenCell ||= written.has(cell.key);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.keys.length > 1 && group.hasWrittenCell);
}

function getIdentityLabel(session: EditSession, rat: Rat): string {
  if (rat === "lte") return "eNBID + CLID";
  if (rat === "umts") return "RNC + CID";
  return session.draft.areaCodes.gsm.mode === "shared" ? "CID" : "LAC + CID";
}

function validateDuplicates(session: EditSession, rat: Rat, cells: readonly CellDraft[], written: ReadonlySet<DraftKey>): EditError[] {
  const { cellIdField } = RAT_FIELDS[rat];
  const errors: EditError[] = [];
  const identityGroups = groupCells(cells, written, (cell) => getIdentityKey(session, cell));
  const pciGroups = groupCells(cells, written, getPciKey);

  for (const cell of cells) {
    if (cellIdField !== null && identityGroups.some((group) => group.keys.includes(cell.key))) {
      errors.push(toError(cellTarget(cell, cellIdField), "stations:edit.errors.cellIdentityDuplicate", { fields: getIdentityLabel(session, rat) }));
    }
    if (pciGroups.some((group) => group.keys.includes(cell.key))) {
      errors.push(toError(cellTarget(cell, "pci"), "stations:edit.errors.pciDuplicate", { pci: getCellNumber(cell, "pci") ?? "" }));
    }
  }
  return errors;
}

function validateAreaCode(session: EditSession, rat: Rat, cells: readonly CellDraft[]): EditError[] {
  const areaCode = session.draft.areaCodes[rat];
  const carriers = cells.filter(carriesAreaCode);
  if (areaCode.mode !== "shared" || carriers.length === 0) return [];

  const field = getAreaCodeField(rat);
  const max = getAreaCodeMax(rat);
  const target: FieldTarget = { scope: "areaCode", rat, field };
  const label = CELL_NUMBER_LABELS[field];
  if (areaCode.value === null) {
    const isQuiet = carriers.every((cell) => cell.id === null);
    return rat === "gsm" ? [toError(target, "stations:edit.errors.required", { field: label }, isQuiet)] : [];
  }
  return isOutOfRange(areaCode.value, 0, max) ? [toError(target, "stations:edit.errors.range", { field: label, max })] : [];
}

function validateRat(session: EditSession, context: ValidationContext, rat: Rat): EditError[] {
  const cells = session.draft.cells.filter((cell) => cell.rat === rat && !cell.isDeleted);
  const writtenCells = cells.filter((cell) => getRowKind(session, cell) !== "same");
  const written = new Set(writtenCells.map((cell) => cell.key));

  return [
    ...validateAreaCode(session, rat, cells),
    ...writtenCells.flatMap((cell) => [
      ...validateRequiredIds(session, cell),
      ...validateNumbers(session, context, cell),
      ...validateBand(context, cell),
    ]),
    ...validateDuplicates(session, rat, cells, written),
  ];
}

export function validateDraft(session: EditSession, context: ValidationContext): EditError[] {
  if (session.action === "delete") return [];

  const errors = [
    ...validateStation(session),
    ...validatePlace(session),
    ...validateSectors(session.draft.sectors),
    ...RAT_ORDER.flatMap((rat) => validateRat(session, context, rat)),
  ];
  if (countCellEntries(session) > MAX_CELL_CHANGES) {
    errors.push(toError({ scope: "general", field: "cells" }, "stations:edit.errors.tooManyCellChanges", { max: MAX_CELL_CHANGES }));
  }
  return errors;
}

export function listShownErrors(errors: readonly EditError[], isSaveAttempted: boolean): EditError[] {
  return isSaveAttempted ? [...errors] : errors.filter((error) => error.isQuiet !== true);
}

export function validateSubmissionExtras(input: SubmissionExtrasInput): EditError[] {
  const { session, uploads, selectIds, removeIds, mainPhotoId } = input;
  const errors: EditError[] = [];
  const uploadCount = uploads.length + input.storedUploadCount;
  const hasCells = session.draft.cells.some((cell) => !cell.isDeleted);

  if (normalizeText(input.note).length > EDIT_LIMITS.submissionNote) {
    errors.push(toError({ scope: "general", field: "note" }, "stations:edit.errors.noteTooLong", { max: EDIT_LIMITS.submissionNote }));
  }
  if (session.action === "delete") return errors;

  if (session.action === "create" && !hasCells && uploadCount === 0) {
    errors.push(toError({ scope: "photos", field: "uploads" }, "submissions:validation.pendingStationPhotoRequired", undefined, true));
  }
  if (uploadCount > EDIT_LIMITS.photoUploads) {
    errors.push(toError({ scope: "photos", field: "uploads" }, "stations:edit.errors.tooManyUploads", { max: EDIT_LIMITS.photoUploads }));
  }
  for (const file of uploads) {
    if (file.size <= EDIT_LIMITS.photoBytes) continue;
    const size = `${EDIT_LIMITS.photoBytes / BYTES_PER_MEGABYTE} MB`;
    errors.push(toError({ scope: "photos", field: "uploads" }, "submissions:photos.fileTooLarge", { name: file.name, size }));
  }
  if (selectIds.length > EDIT_LIMITS.photoPicks || removeIds.length > EDIT_LIMITS.photoPicks) {
    errors.push(toError({ scope: "photos", field: "picks" }, "stations:edit.errors.tooManyPicks", { max: EDIT_LIMITS.photoPicks }));
  }
  if (mainPhotoId !== null && !selectIds.includes(mainPhotoId)) {
    errors.push(toError({ scope: "photos", field: "mainPhoto" }, "stations:edit.errors.mainPhotoNotPicked"));
  }
  return errors;
}

function hasSameValues(left: TextValues | undefined, right: TextValues | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return shallowEqual(left, right);
}

function isSameError(left: EditError, right: EditError): boolean {
  if (left === right) return true;
  return (
    left.messageKey === right.messageKey &&
    left.isQuiet === right.isQuiet &&
    left.target.scope === right.target.scope &&
    left.target.key === right.target.key &&
    left.target.rat === right.target.rat &&
    left.target.field === right.target.field &&
    hasSameValues(left.values, right.values)
  );
}

function isSameGroup(group: readonly EditError[], known: readonly EditError[]): boolean {
  if (group.length !== known.length) return false;
  return group.every((error, index) => {
    const knownError = known[index];
    return knownError !== undefined && isSameError(error, knownError);
  });
}

export function groupErrorsByKey(errors: readonly EditError[], scope: RowScope): Map<DraftKey, EditError[]> {
  const groups = new Map<DraftKey, EditError[]>();
  for (const error of errors) {
    const { key } = error.target;
    if (error.target.scope !== scope || key === undefined) continue;
    const group = groups.get(key) ?? [];
    group.push(error);
    groups.set(key, group);
  }

  const known = lastGroups[scope];
  for (const [key, group] of groups) {
    const knownGroup = known.get(key);
    if (knownGroup !== undefined && isSameGroup(group, knownGroup)) groups.set(key, knownGroup);
  }
  lastGroups[scope] = groups;
  return groups;
}

export function findFieldError(errors: readonly EditError[], target: FieldTarget): EditError | undefined {
  return errors.find(
    (error) =>
      error.target.scope === target.scope &&
      error.target.key === target.key &&
      error.target.field === target.field &&
      (target.scope !== "areaCode" || error.target.rat === target.rat),
  );
}
