import {
  attachments,
  bands,
  cells,
  gsmCells,
  locationPhotos,
  locations,
  lteCells,
  nrCells,
  operators,
  proposedLocations,
  proposedStations,
  regions,
  stationPhotoSelections,
  stationSectors,
  stations,
  submissions,
  umtsCells,
} from "@openbts/drizzle";
import type {
  CellEditInput,
  CellRat,
  CellType,
  CountryFeatures,
  LocationChangeInput,
  SectorChangeInput,
  StationChangeInput,
  StationEditInput,
  SubmissionAction,
  SubmissionCreate,
  SubmissionPhotoPicksInput,
  SubmissionUpdate,
  SubmittedLocationInput,
} from "@openbts/shared/contract";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse, ValidationError } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import { toFieldPath } from "../../lib/fieldPath.js";
import { itemRefusal } from "../../lib/itemRefusals.js";
import { RADIO_FIELD_NAMES } from "../cells/radioFields.js";
import { isNormalRat } from "../cells/ratCellPersistence.js";
import { assertOwnerFitsRegion, toStructureChange } from "../locations/structure.js";
import { findRegionIdAt } from "../regions/lookup.js";
import { disabledCountryFeatures, findPlacementCountryFeatures, getStationCountryFeatures } from "../stations/countryFeatures.js";
import { CONTRACT_RATS, type CellRow, DATABASE_RATS, DATABASE_STATUSES } from "../stations/serialize.js";
import { findNamedOwner } from "../structures/write.js";
import {
  type ChangeCell,
  type PhotoPickInput,
  type SingleSubmission,
  type SubmissionChange,
  nrInsertSchema,
  proposedLocationInsert,
} from "./create.js";
import { gsmInsertSchema, lteInsertSchema, umtsInsertSchema } from "./helpers.js";
import type { SubmissionRow } from "./read.js";
import type { SubmissionUpdateBody } from "./update.js";

type SectorInput = NonNullable<SingleSubmission["sectors"]>[number];
type StationInput = NonNullable<SingleSubmission["station"]>;
type LocationInput = NonNullable<SingleSubmission["location"]>;
type ProposedOwner = Pick<LocationInput, "structure_owner_id" | "structure_owner_name">;
type StoredOwnerProposal = Pick<typeof proposedLocations.$inferSelect, "structure_owner_name" | "region_id">;
type TargetCell = { cell: CellRow; details: Record<string, unknown> | null };

type ChangeContent = {
  station?: StationEditInput;
  location?: SubmittedLocationInput;
  sectors?: SectorChangeInput[];
  cells?: CellEditInput[];
};
type TranslatedContent = {
  station?: StationInput;
  location?: LocationInput;
  sectors?: SectorInput[];
  cells?: ChangeCell[];
};
export type StationEdit = {
  action: SubmissionAction;
  stationId?: number;
  station?: StationEditInput;
  location?: LocationChangeInput | null;
  sectors?: SectorChangeInput[];
  cells?: CellEditInput[];
};
type InvalidField = { field: string; validationMessage: string };
type IdentifierPair = { fields: readonly [node: string, cell: string]; unknownTogetherMessage: string };
type PhotoPickLocation = Pick<LocationChangeInput, "latitude" | "longitude">;
export type BodyPath = (path: PropertyKey[]) => PropertyKey[];
type TranslationContext = { bodyPath?: BodyPath; submissionId?: string; detachesLocation?: boolean };

const OMNIDIRECTIONAL_AZIMUTH = 360;

export const SUBMISSION_TYPES = { create: "new", update: "update", delete: "delete" } as const satisfies Record<SubmissionAction, string>;
const DATABASE_CELL_TYPES = {
  macro: "MACROCELL",
  micro: "MICROCELL",
  pico: "PICOCELL",
  femto: "FEMTOCELL",
} as const satisfies Record<CellType, string>;

const RADIO_SCHEMAS: Record<CellRat, z.ZodType> = { gsm: gsmInsertSchema, umts: umtsInsertSchema, lte: lteInsertSchema, nr: nrInsertSchema };
const ALL_RADIO_FIELDS = [...new Set(Object.values(RADIO_FIELD_NAMES).flatMap((names) => Object.values(names)))];
const UNKNOWN_AS_ZERO: Partial<Record<CellRat, IdentifierPair>> = {
  umts: { fields: ["rnc", "cid"], unknownTogetherMessage: "RNC and CID are unknown together: a cell with a known RNC needs a CID" },
  lte: { fields: ["enbid", "clid"], unknownTogetherMessage: "eNB ID and CLID are unknown together: a cell with a known eNB ID needs a CLID" },
};
const CLEARED_NOTES = "";

function toUplinkInput(backhaul: StationChangeInput["backhaul"]): Pick<StationInput, "uplink_type" | "uplink_speed" | "uplink_model"> {
  if (backhaul === undefined) return {};
  if (backhaul === null) return { uplink_type: null, uplink_speed: null, uplink_model: null };
  return { uplink_type: backhaul.medium, uplink_speed: backhaul.speedMbps, uplink_model: backhaul.model };
}

function toStationInput(station: StationChangeInput): StationInput {
  const identifiers = new Map(station.identifiers?.map((identifier) => [identifier.kind, identifier.value]));
  const networksId = identifiers.get("networksId");

  return {
    station_id: station.siteId,
    operator_id: station.operatorId,
    notes: station.notes,
    networks_id: typeof networksId === "string" ? Number(networksId) : networksId,
    networks_name: identifiers.get("networksName"),
    mno_name: identifiers.get("operatorName"),
    ...toUplinkInput(station.backhaul),
  };
}

function toLocationInput(location: SubmittedLocationInput, proposedOwner: ProposedOwner): LocationInput {
  return {
    region_id: location.regionId,
    city: location.city,
    address: location.address,
    ...toStructureChange(location.structure),
    ...proposedOwner,
    latitude: location.latitude,
    longitude: location.longitude,
    move: location.move,
  };
}

function toSectorInput(sector: SectorChangeInput, currentAzimuths: ReadonlyMap<number, number>): SectorInput {
  if (sector.action === "create") {
    return { operation: "add", local_id: sector.key, target_sector_id: null, azimuth: sector.azimuth ?? OMNIDIRECTIONAL_AZIMUTH };
  }

  const currentAzimuth = currentAzimuths.get(sector.id);
  if (currentAzimuth === undefined) throw new ErrorResponse("BAD_REQUEST", { message: `Sector ${sector.id} does not belong to this station` });

  const localId = `sector-${sector.id}`;
  if (sector.action === "delete") return { operation: "delete", local_id: localId, target_sector_id: sector.id, azimuth: currentAzimuth };
  return { operation: "update", local_id: localId, target_sector_id: sector.id, azimuth: sector.azimuth ?? OMNIDIRECTIONAL_AZIMUTH };
}

function toSectorReference(cell: { sectorId?: number | null; sectorKey?: string }) {
  if (cell.sectorKey !== undefined) return { target_sector_id: null, sector_local_id: cell.sectorKey, sector_unassigned: false };
  if (cell.sectorId === null) return { target_sector_id: null, sector_local_id: null, sector_unassigned: true };
  if (cell.sectorId !== undefined) return { target_sector_id: cell.sectorId, sector_local_id: null, sector_unassigned: false };
  return {};
}

function toDetails(rat: CellRat, source: Record<string, unknown>): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [column, field] of Object.entries(RADIO_FIELD_NAMES[rat])) {
    if (source[field] === undefined) continue;
    details[column] = source[field] === null && UNKNOWN_AS_ZERO[rat]?.fields.includes(field) ? 0 : source[field];
  }
  return details;
}

function assertUnknownTogether(
  rat: CellRat,
  sent: Record<string, unknown>,
  current: Record<string, unknown> | null,
  details: Record<string, unknown>,
): void {
  const pair = UNKNOWN_AS_ZERO[rat];
  if (!pair) return;

  const [nodeField, cellField] = pair.fields;
  const isCurrentUnknown = current !== null && current[nodeField] === 0 && current[cellField] === 0;
  const isCellUnknown = sent[cellField] === null || (sent[cellField] === undefined && isCurrentUnknown);
  const isNodeKnown = typeof details[nodeField] === "number" && details[nodeField] !== 0;
  if (isCellUnknown && isNodeKnown) throw new ErrorResponse("BAD_REQUEST", { message: pair.unknownTogetherMessage });
}

function currentDetails(rat: CellRat, row: Record<string, unknown> | null): Record<string, unknown> {
  if (!row) return {};
  return Object.fromEntries(Object.keys(RADIO_FIELD_NAMES[rat]).map((column) => [column, row[column]]));
}

function toCellType(cellType: CellType | null): CellRow["type"] {
  return cellType === null ? null : DATABASE_CELL_TYPES[cellType];
}

function assertCodesEnabled(cell: CellEditInput, features: CountryFeatures): void {
  const source: Record<string, unknown> = cell;
  if (!features.psc && typeof source.psc === "number") throw new ErrorResponse("BAD_REQUEST", { message: "psc is not kept in this country" });
  if (!features.bsic && typeof source.bsic === "number") throw new ErrorResponse("BAD_REQUEST", { message: "bsic is not kept in this country" });
}

function toCellInput(cell: CellEditInput, targets: ReadonlyMap<number, TargetCell>, features: CountryFeatures): ChangeCell {
  assertCodesEnabled(cell, features);

  if (cell.action === "create") {
    const details = toDetails(cell.rat, cell);
    assertUnknownTogether(cell.rat, cell, null, details);
    return {
      operation: "add",
      band_id: cell.bandId,
      rat: DATABASE_RATS[cell.rat],
      type: toCellType(cell.cellType ?? null),
      notes: cell.notes ?? null,
      ...toSectorReference(cell),
      is_confirmed: cell.isConfirmed,
      details,
    };
  }

  const target = targets.get(cell.id);
  if (!target) throw new ErrorResponse("NOT_FOUND", { message: `Cell ${cell.id} does not exist on this station` });
  const { band_id, rat, type, notes, station_id } = target.cell;

  if (cell.action === "delete") return { operation: "delete", target_cell_id: cell.id, band_id, rat: isNormalRat(rat) ? rat : null, type, notes };

  const contractRat = CONTRACT_RATS[rat];
  if (!contractRat) throw new ErrorResponse("BAD_REQUEST", { message: `Cell ${cell.id} cannot be changed through a submission` });

  const source: Record<string, unknown> = cell;
  const ownFields = Object.values(RADIO_FIELD_NAMES[contractRat]);
  const misplaced = ALL_RADIO_FIELDS.find((field) => source[field] !== undefined && !ownFields.includes(field));
  if (misplaced) throw new ErrorResponse("BAD_REQUEST", { message: `${misplaced} does not apply to cell ${cell.id}, which is ${rat}` });

  const change: ChangeCell = {
    operation: "update",
    target_cell_id: cell.id,
    band_id: cell.bandId ?? band_id,
    rat: DATABASE_RATS[contractRat],
    type: cell.cellType === undefined ? type : toCellType(cell.cellType),
    notes: cell.notes === undefined ? null : (cell.notes ?? CLEARED_NOTES),
    ...toSectorReference(cell),
    is_confirmed: cell.isConfirmed,
  };
  if (cell.stationId !== undefined && cell.stationId !== station_id) change.destination_station_id = cell.stationId;

  const details = { ...currentDetails(contractRat, target.details), ...toDetails(contractRat, source) };
  assertUnknownTogether(contractRat, source, target.details, details);
  return { ...change, details };
}

async function loadSectorAzimuths(stationId: number | null, sectors: readonly SectorChangeInput[] | undefined): Promise<Map<number, number>> {
  if (stationId === null || !sectors?.some((sector) => sector.action !== "create")) return new Map();

  const rows = await db
    .select({ id: stationSectors.id, azimuth: stationSectors.azimuth })
    .from(stationSectors)
    .where(eq(stationSectors.station_id, stationId));
  return new Map(rows.map((row) => [row.id, row.azimuth]));
}

async function loadTargetCells(stationId: number | null, changes: readonly CellEditInput[] | undefined): Promise<Map<number, TargetCell>> {
  const cellIds = (changes ?? []).flatMap((cell) => (cell.action === "create" ? [] : [cell.id]));
  if (stationId === null || cellIds.length === 0) return new Map();

  const rows = await db
    .select({ cell: cells, gsm: gsmCells, umts: umtsCells, lte: lteCells, nr: nrCells })
    .from(cells)
    .leftJoin(gsmCells, eq(gsmCells.cell_id, cells.id))
    .leftJoin(umtsCells, eq(umtsCells.cell_id, cells.id))
    .leftJoin(lteCells, eq(lteCells.cell_id, cells.id))
    .leftJoin(nrCells, eq(nrCells.cell_id, cells.id))
    .where(and(eq(cells.station_id, stationId), inArray(cells.id, cellIds)));
  return new Map(rows.map((row) => [row.cell.id, { cell: row.cell, details: row.gsm ?? row.umts ?? row.lte ?? row.nr }]));
}

async function assertReferencesExist(content: ChangeContent): Promise<void> {
  const operatorId = content.station?.operatorId;
  const regionId = content.location?.regionId;
  const bandIds = unique((content.cells ?? []).map((cell) => (cell.action === "delete" ? undefined : cell.bandId)));

  const [operatorRows, regionRows, bandRows] = await Promise.all([
    operatorId === undefined ? null : db.select({ id: operators.id }).from(operators).where(eq(operators.id, operatorId)).limit(1),
    regionId === undefined ? null : db.select({ id: regions.id }).from(regions).where(eq(regions.id, regionId)).limit(1),
    bandIds.length === 0 ? null : db.select({ id: bands.id }).from(bands).where(inArray(bands.id, bandIds)),
  ]);

  if (operatorRows?.length === 0) throw new ErrorResponse("BAD_REQUEST", { message: `Operator ${operatorId} does not exist` });
  if (regionRows?.length === 0) throw new ErrorResponse("BAD_REQUEST", { message: `Region ${regionId} does not exist` });
  if (bandRows && bandRows.length !== bandIds.length) throw new ErrorResponse("BAD_REQUEST", { message: "One or more bands do not exist" });
}

async function loadCurrentRegionId(stationId: number | null): Promise<number | null> {
  if (stationId === null) return null;

  const [row] = await db
    .select({ regionId: locations.region_id })
    .from(stations)
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .where(eq(stations.id, stationId))
    .limit(1);
  return row?.regionId ?? null;
}

async function withRegion(stationId: number | null, location: SubmittedLocationInput | undefined): Promise<SubmittedLocationInput | undefined> {
  if (!location || location.regionId !== undefined || location.latitude === undefined || location.longitude === undefined) return location;

  const { latitude, longitude } = location;
  const regionId = await findRegionIdAt({ latitude, longitude, regionId: await loadCurrentRegionId(stationId) });
  if (regionId !== null) return { ...location, regionId };
  if (stationId !== null) return location;
  throw new ErrorResponse("BAD_REQUEST", { message: "No region could be worked out for these coordinates, send location.regionId" });
}

async function assertSentOwnerFits(stationId: number | null, location: LocationChangeInput | undefined): Promise<void> {
  const ownerId = location?.structure?.ownerId;
  if (typeof ownerId !== "number") return;

  await assertOwnerFitsRegion(db, ownerId, location?.regionId ?? (await loadCurrentRegionId(stationId)));
}

async function keepsStoredOwnerProposal(
  stored: StoredOwnerProposal | undefined,
  ownerName: string,
  regionId: number | null,
  storedRegionId: number | null,
): Promise<boolean> {
  if (stored?.structure_owner_name !== ownerName) return false;
  if (regionId === null || storedRegionId === null) return false;
  if (regionId === storedRegionId) return true;

  const countries = await db
    .select({ id: regions.id, countryCode: regions.countryCode })
    .from(regions)
    .where(inArray(regions.id, [regionId, storedRegionId]));
  const nextCountry = countries.find((region) => region.id === regionId)?.countryCode;
  const storedCountry = countries.find((region) => region.id === storedRegionId)?.countryCode;
  return nextCountry !== undefined && nextCountry === storedCountry;
}

async function findProposedOwner(
  stationId: number | null,
  location: SubmittedLocationInput | undefined,
  features: CountryFeatures,
  { bodyPath, submissionId }: TranslationContext,
): Promise<ProposedOwner> {
  if (location === undefined) return {};
  const submittedName = location.structure?.ownerName;
  const proposalsEnabled = features.structureOwnerProposals;
  if (submittedName === undefined && (location.structure?.ownerId !== undefined || proposalsEnabled || submissionId === undefined)) return {};

  const stored =
    !proposalsEnabled && submissionId !== undefined
      ? await db.query.proposedLocations.findFirst({
          where: { submission_id: submissionId },
          columns: { structure_owner_name: true, region_id: true },
        })
      : undefined;
  const ownerName = submittedName ?? stored?.structure_owner_name;
  if (ownerName === undefined || ownerName === null) return {};

  const currentRegionId = location.regionId === undefined || stored?.region_id === null ? await loadCurrentRegionId(stationId) : null;
  const regionId = location.regionId ?? currentRegionId;
  const storedRegionId = stored?.region_id ?? currentRegionId;
  const existing = await findNamedOwner(db, ownerName, regionId);
  if (existing) return submittedName === undefined ? {} : { structure_owner_id: existing.id };
  if (!proposalsEnabled && !(await keepsStoredOwnerProposal(stored, ownerName, regionId, storedRegionId))) {
    const path = ["location", "structure", "ownerName"];
    throw itemRefusal("FEATURE_DISABLED", "Structure owner proposals are disabled", bodyPath ? bodyPath(path) : path);
  }
  return submittedName === undefined ? {} : { structure_owner_id: null, structure_owner_name: ownerName };
}

async function loadSubmissionPlacement(submissionId: string | undefined) {
  if (submissionId === undefined) return undefined;

  const [placement] = await db
    .select({ regionId: proposedLocations.region_id, operatorId: proposedStations.operator_id })
    .from(submissions)
    .leftJoin(proposedLocations, eq(proposedLocations.submission_id, submissions.id))
    .leftJoin(proposedStations, eq(proposedStations.submission_id, submissions.id))
    .where(eq(submissions.id, submissionId))
    .limit(1);
  return placement;
}

async function translateContent(stationId: number | null, content: ChangeContent, context: TranslationContext = {}): Promise<TranslatedContent> {
  const destinationStationIds = (content.cells ?? []).flatMap((cell) =>
    cell.action === "update" && cell.stationId !== undefined && cell.stationId !== stationId ? [cell.stationId] : [],
  );
  const [azimuths, targets, normalizedLocation, storedPlacement, destinationFeatures] = await Promise.all([
    loadSectorAzimuths(stationId, content.sectors),
    loadTargetCells(stationId, content.cells),
    withRegion(stationId, content.location),
    loadSubmissionPlacement(context.submissionId),
    getStationCountryFeatures(destinationStationIds),
    assertReferencesExist(content),
  ]);
  const location =
    normalizedLocation && normalizedLocation.regionId === undefined && typeof storedPlacement?.regionId === "number"
      ? { ...normalizedLocation, regionId: storedPlacement.regionId }
      : normalizedLocation;
  const features = await findPlacementCountryFeatures({
    stationId,
    regionId: location?.regionId ?? storedPlacement?.regionId,
    operatorId: content.station?.operatorId ?? storedPlacement?.operatorId,
    withoutLocation: context.detachesLocation,
  });
  await assertSentOwnerFits(stationId, location);
  const proposedOwner = await findProposedOwner(stationId, location, features, context);

  return {
    station: content.station && toStationInput(content.station),
    location: location && toLocationInput(location, proposedOwner),
    sectors: content.sectors?.map((sector) => toSectorInput(sector, azimuths)),
    cells: content.cells?.map((cell) =>
      toCellInput(
        cell,
        targets,
        cell.action === "update" && cell.stationId !== undefined && cell.stationId !== stationId
          ? (destinationFeatures.get(cell.stationId) ?? disabledCountryFeatures)
          : features,
      ),
    ),
  };
}

function findInvalidFields(schema: z.ZodType, value: unknown, toPath: BodyPath): InvalidField[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({ field: toFieldPath(toPath(issue.path)) || "unknown", validationMessage: issue.message }));
}

function toRadioFieldPath(rat: CellRat, [column, ...rest]: PropertyKey[]): PropertyKey[] {
  if (column === undefined) return [];

  const field = Object.entries(RADIO_FIELD_NAMES[rat]).find(([radioColumn]) => radioColumn === column)?.[1];
  return [field ?? column, ...rest];
}

function assertValid({ location, cells = [] }: TranslatedContent, bodyPath: BodyPath = (path) => path): void {
  const invalidLocation = location ? findInvalidFields(proposedLocationInsert, location, (path) => bodyPath(["location", ...path])) : [];
  const invalidCells = cells.flatMap((cell, index) => {
    const rat = cell.rat ? CONTRACT_RATS[cell.rat] : undefined;
    if (!rat || !cell.details) return [];
    return findInvalidFields(RADIO_SCHEMAS[rat], cell.details, (path) => bodyPath(["cells", index, ...toRadioFieldPath(rat, path)]));
  });
  const invalid = [...invalidLocation, ...invalidCells];
  if (invalid.length > 0) throw new ValidationError(invalid);
}

async function loadStationPhotoIds(stationId: number, fileIds: string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: locationPhotos.id, fileId: attachments.uuid })
    .from(locationPhotos)
    .innerJoin(attachments, eq(attachments.id, locationPhotos.attachment_id))
    .innerJoin(stations, eq(stations.location_id, locationPhotos.location_id))
    .where(and(eq(stations.id, stationId), inArray(attachments.uuid, fileIds)));
  return new Map(rows.map((row) => [row.fileId, row.id]));
}

async function loadNewStationPhotoIds(location: PhotoPickLocation | undefined, fileIds: string[]): Promise<Map<string, number>> {
  const [rows, [existingLocation]] = await Promise.all([
    db
      .select({ id: locationPhotos.id, fileId: attachments.uuid, locationId: locationPhotos.location_id })
      .from(locationPhotos)
      .innerJoin(attachments, eq(attachments.id, locationPhotos.attachment_id))
      .where(inArray(attachments.uuid, fileIds))
      .orderBy(asc(locationPhotos.id)),
    location?.latitude === undefined || location.longitude === undefined
      ? []
      : db
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.latitude, location.latitude), eq(locations.longitude, location.longitude)))
          .limit(1),
  ]);

  const idsByFile = new Map<string, number>();
  for (const row of rows) {
    if (!idsByFile.has(row.fileId) || row.locationId === existingLocation?.id) idsByFile.set(row.fileId, row.id);
  }
  return idsByFile;
}

async function assertShownByStation(stationId: number, locationPhotoIds: number[]): Promise<void> {
  if (locationPhotoIds.length === 0) return;

  const [shown] = await db
    .select({ total: count() })
    .from(stationPhotoSelections)
    .where(and(eq(stationPhotoSelections.station_id, stationId), inArray(stationPhotoSelections.location_photo_id, locationPhotoIds)));
  if ((shown?.total ?? 0) !== locationPhotoIds.length) {
    throw new ErrorResponse("BAD_REQUEST", { message: "One or more photos in removeIds are not shown by this station" });
  }
}

async function translatePhotoPicks(
  stationId: number | null,
  photos: SubmissionPhotoPicksInput | undefined,
  location?: PhotoPickLocation,
): Promise<PhotoPickInput> {
  const fileIds = unique([...(photos?.selectIds ?? []), ...(photos?.removeIds ?? []), photos?.mainPhotoId]);
  if (fileIds.length === 0) return {};

  const idsByFile = stationId === null ? await loadNewStationPhotoIds(location, fileIds) : await loadStationPhotoIds(stationId, fileIds);
  if (idsByFile.size !== fileIds.length) {
    throw new ErrorResponse("BAD_REQUEST", {
      message: stationId === null ? "One or more photos do not exist" : "One or more photos do not belong to this station's location",
    });
  }

  const toIds = (ids: readonly string[]) => unique(ids.map((fileId) => idsByFile.get(fileId)));
  const removedIds = photos?.removeIds && toIds(photos.removeIds);
  if (stationId !== null && removedIds) await assertShownByStation(stationId, removedIds);

  return {
    location_photo_ids: photos?.selectIds && toIds(photos.selectIds),
    location_photo_ids_to_remove: removedIds,
    main_location_photo_id: photos?.mainPhotoId ? idsByFile.get(photos.mainPhotoId) : undefined,
  };
}

async function loadProposedCoordinates(submissionId: string): Promise<PhotoPickLocation | undefined> {
  const [row] = await db
    .select({ latitude: proposedLocations.latitude, longitude: proposedLocations.longitude })
    .from(proposedLocations)
    .where(eq(proposedLocations.submission_id, submissionId))
    .limit(1);
  if (!row || row.latitude === null || row.longitude === null) return undefined;
  return { latitude: row.latitude, longitude: row.longitude };
}

export async function toPhotoPickUpdate(
  submission: Pick<SubmissionRow, "id" | "type" | "station_id">,
  photos: SubmissionPhotoPicksInput,
  location: PhotoPickLocation | undefined,
): Promise<PhotoPickInput> {
  if (submission.type !== "update" && photos.removeIds?.length) {
    throw new ErrorResponse("BAD_REQUEST", { message: "Photos can only be removed when updating a station" });
  }

  const stationId = submission.type === "update" ? submission.station_id : null;
  const pickLocation = stationId === null ? (location ?? (await loadProposedCoordinates(submission.id))) : undefined;
  const picks = await translatePhotoPicks(stationId, photos, pickLocation);

  return { ...picks, location_photo_ids: picks.location_photo_ids ?? [], location_photo_ids_to_remove: picks.location_photo_ids_to_remove ?? [] };
}

export async function toSingleSubmission(body: SubmissionCreate, bodyPath?: BodyPath): Promise<SingleSubmission> {
  const stationId = body.stationId ?? null;
  const [translated, picks] = await Promise.all([
    translateContent(stationId, body, { bodyPath }),
    translatePhotoPicks(stationId, body.photos, body.location),
  ]);
  assertValid(translated, bodyPath);

  return {
    type: SUBMISSION_TYPES[body.action],
    station_id: body.stationId,
    origin: body.origin,
    submitter_note: body.note || undefined,
    ...translated,
    pending_photos: body.photos?.uploadCount,
    ...picks,
  };
}

export async function toDirectChange(edit: StationEdit, bodyPath?: BodyPath): Promise<SubmissionChange> {
  const stationId = edit.stationId ?? null;
  const detachesStation = edit.action === "update" && edit.location === null;
  const translated = await translateContent(stationId, { ...edit, location: edit.location ?? undefined }, { detachesLocation: detachesStation });
  assertValid(translated, bodyPath);

  const { status, isConfirmed } = edit.station ?? {};
  return {
    type: SUBMISSION_TYPES[edit.action],
    station_id: edit.stationId,
    ...translated,
    location: detachesStation ? null : translated.location,
    station_status: status && DATABASE_STATUSES[status],
    station_is_confirmed: isConfirmed,
  };
}

export async function toSubmissionUpdateInput(
  stationId: number | null,
  body: SubmissionUpdate,
  context?: { submissionId: string },
): Promise<SubmissionUpdateBody> {
  const translated = await translateContent(stationId, body, context);
  assertValid(translated);

  return { submitter_note: body.note, review_notes: body.reviewNote, ...translated };
}
