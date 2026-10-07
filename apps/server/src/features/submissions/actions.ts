import {
  attachments,
  cells,
  extraIdentificators,
  locationPhotos,
  locations,
  operators,
  stationPhotoSelections,
  stationSectors,
  stationUplinks,
  stations,
  submissions,
} from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import type { CountryFeatures } from "@openbts/shared/contract";
import { getNetworksSiblingMnc } from "@openbts/shared/operatorUtils";
import { logger } from "better-auth";
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";
import { deletePhotoFiles } from "../../utils/photoFiles.js";
import {
  type AuditRecorder,
  type CellSnapshot,
  type PhotoSelectionSnapshots,
  type SectorSnapshot,
  auditContextFromRequest,
  flattenCellRow,
  loadCellSnapshots,
  loadPhotoSelectionSnapshots,
  loadSectorSnapshot,
  logPhotoSelectionChanges,
  runAuditedOperation,
} from "../audit/index.js";
import { assertStoredCellBandsFit } from "../cells/arfcnValidation.js";
import { checkCellDuplicatesBatch, checkPciDuplicates } from "../cells/duplicateCheck.js";
import {
  type NormalRat,
  type RATCellDetailsRow,
  type RATInsertDetails,
  type RATUpdateDetails,
  insertRATCellDetailsReturning,
  isNormalRat,
  updateRATCellDetailsReturning,
} from "../cells/ratCellPersistence.js";
import { deleteLocationWithPhotos } from "../locations/deleteWithPhotos.js";
import { type StructureChange, assertOwnerFitsAfterWrite } from "../locations/structure.js";
import { buildInternalStationActionUrl } from "../notifications/actionUrls.js";
import { createAndDeliverNotification, createQueuedSubmissionApprovalNotification, notifyStationWatchers } from "../notifications/service.js";
import { findRegionIdAt } from "../regions/lookup.js";
import { disabledCountryFeatures, getStationCountryFeatures } from "../stations/countryFeatures.js";
import { syncStationsPermitsAssociations } from "../stations/permitsAssociation.js";
import { migrateStationPhotosToLocation } from "../stations/photoMigration.js";
import { writeSectorAzimuths } from "../stations/sectorAzimuths.js";
import { stationStatusForCellCount, stationStatusUpdate } from "../stations/status.js";
import { isUplinkType } from "../stations/uplink.js";
import type { StructureOwnerRow } from "../structures/serialize.js";
import { findOrCreateNamedOwner } from "../structures/write.js";
import type { ChangeCell, SubmissionChange } from "./create.js";
import {
  type ProposedLocationChanges,
  type ProposedLocationRow,
  type ProposedStationChanges,
  type ProposedStructureChange,
  getProposedLocationChanges,
  getProposedStationChanges,
  type gsmSelectSchema,
  type lteSelectSchema,
  normalizeText,
  type nrSelectSchema,
  type proposedCellsSelectSchema,
  resolveSectorChanges,
  stampSubmissionCountry,
  stripUnchangedProposalData,
  type umtsSelectSchema,
} from "./helpers.js";
import { lockSubmission } from "./lock.js";
import type { ProposedSectorRow } from "./serialize.js";
import { getSubmissionStationLabels, stationLabelMetadata } from "./stationLabels.js";

type LocationRow = NonNullable<Awaited<ReturnType<DbTx["query"]["locations"]["findFirst"]>>>;
type LocationChange = { op: "create"; old?: never; new: LocationRow } | { op: "update"; old: LocationRow; new: LocationRow };
type UpsertLocationResult = { locationId: number; change: LocationChange | null; createdOwner: StructureOwnerRow | null };
type LocationValues = ProposedStructureChange & {
  region_id: number;
  city?: string | null;
  address?: string | null;
  longitude: number;
  latitude: number;
};
type OwnedLocation = { location: LocationValues; createdOwner: StructureOwnerRow | null };

const REVIEWER_NOTE_MAX_LENGTH = 500;

function reviewerNoteMetadata(note: string | null): { reviewer_note?: string } {
  if (!note) return {};
  if (note.length <= REVIEWER_NOTE_MAX_LENGTH) return { reviewer_note: note };
  return { reviewer_note: `${note.slice(0, REVIEWER_NOTE_MAX_LENGTH - 3).trimEnd()}...` };
}

function toLocationValues(location: ProposedLocationChanges): LocationValues {
  const { region_id, longitude, latitude, structure_type, structure_owner_id, structure_owner_name, structure_note } = location;
  if (typeof region_id !== "number" || typeof longitude !== "number" || typeof latitude !== "number")
    throw new ErrorResponse("BAD_REQUEST", { message: "Proposed location is missing a region or coordinates" });
  return {
    region_id,
    city: location.city,
    address: location.address,
    longitude,
    latitude,
    structure_type,
    structure_owner_id,
    structure_owner_name,
    structure_note,
  };
}

function withSentStructure(location: LocationValues, changes: ProposedLocationChanges): LocationValues {
  const { structure_type, structure_owner_id, structure_owner_name, structure_note } = changes;
  return { ...location, structure_type, structure_owner_id, structure_owner_name, structure_note };
}

async function resolveNamedOwner(tx: DbTx, proposed: LocationValues, regionId: number): Promise<OwnedLocation> {
  const { structure_owner_name: ownerName, ...location } = proposed;
  if (!ownerName) return { location, createdOwner: null };

  const { owner, isNew } = await findOrCreateNamedOwner(tx, ownerName, regionId);
  return { location: { ...location, structure_owner_id: owner.id }, createdOwner: isNew ? owner : null };
}

function resolveChange<T>(change: T | undefined, current: T): T {
  return change === undefined ? current : change;
}

async function resolveRegionId({ region_id, longitude, latitude }: LocationValues): Promise<number> {
  return (await findRegionIdAt({ longitude, latitude, regionId: region_id })) ?? region_id;
}

async function resolveRegionChange(current: LocationRow, proposed: LocationValues): Promise<{ region_id?: number }> {
  if (current.region_id === proposed.region_id) return {};

  const regionId = await resolveRegionId(proposed);
  return regionId === current.region_id ? {} : { region_id: regionId };
}

function resolveStructureChange(current: LocationRow, proposed: LocationValues): StructureChange {
  const { structure_type: type, structure_owner_id: ownerId, structure_note: note } = proposed;
  const change: StructureChange = {};
  if (type !== undefined && type !== current.structure_type) change.structure_type = type;
  if (ownerId !== undefined && ownerId !== current.structure_owner_id) change.structure_owner_id = ownerId;
  if (note !== undefined && note !== current.structure_note) change.structure_note = note;
  return change;
}

async function upsertLocation(tx: DbTx, proposedLocation: LocationValues, knownLocationAtCoords?: LocationRow | null): Promise<UpsertLocationResult> {
  const existingLocation =
    knownLocationAtCoords !== undefined
      ? knownLocationAtCoords
      : await tx.query.locations.findFirst({
          where: {
            AND: [{ longitude: proposedLocation.longitude }, { latitude: proposedLocation.latitude }],
          },
        });

  if (existingLocation) {
    const regionChange = await resolveRegionChange(existingLocation, proposedLocation);
    const owned = await resolveNamedOwner(tx, proposedLocation, regionChange.region_id ?? existingLocation.region_id);
    const structureChange = resolveStructureChange(existingLocation, owned.location);
    const city = resolveChange(proposedLocation.city, existingLocation.city);
    const address = resolveChange(proposedLocation.address, existingLocation.address);
    const metadataChanged =
      regionChange.region_id !== undefined ||
      Object.keys(structureChange).length > 0 ||
      existingLocation.city !== city ||
      existingLocation.address !== address;

    if (metadataChanged) {
      await assertOwnerFitsAfterWrite(tx, existingLocation, { ...existingLocation, ...regionChange, ...structureChange });
      const [updatedLocation] = await tx
        .update(locations)
        .set({ ...regionChange, ...structureChange, city, address, updatedAt: new Date() })
        .where(eq(locations.id, existingLocation.id))
        .returning();
      if (!updatedLocation) throw new ErrorResponse("FAILED_TO_UPDATE", { message: "Failed to update location" });

      return {
        locationId: existingLocation.id,
        change: { op: "update", old: existingLocation, new: updatedLocation },
        createdOwner: owned.createdOwner,
      };
    }
    return { locationId: existingLocation.id, change: null, createdOwner: owned.createdOwner };
  }

  const regionId = await resolveRegionId(proposedLocation);
  const { location, createdOwner } = await resolveNamedOwner(tx, proposedLocation, regionId);
  await assertOwnerFitsAfterWrite(tx, null, { ...location, region_id: regionId });
  const [newLocation] = await tx
    .insert(locations)
    .values({
      region_id: regionId,
      city: location.city ?? null,
      address: location.address ?? null,
      structure_type: location.structure_type,
      structure_owner_id: location.structure_owner_id,
      structure_note: location.structure_note,
      longitude: location.longitude,
      latitude: location.latitude,
    })
    .returning();
  if (!newLocation) throw new ErrorResponse("FAILED_TO_CREATE", { message: "Failed to create location" });
  return { locationId: newLocation.id, change: { op: "create", new: newLocation }, createdOwner };
}

async function logCreatedOwner(audit: AuditRecorder, owner: StructureOwnerRow | null, stationId: number | null): Promise<void> {
  if (owner === null) return;
  await audit.log({ entity: "structure_owners", op: "create", recordId: owner.id, stationId, new: owner, metadata: audit.entryMetadata });
}

async function logLocationChange(audit: AuditRecorder, result: UpsertLocationResult, stationId: number | null): Promise<void> {
  await logCreatedOwner(audit, result.createdOwner, stationId);
  if (!result.change) return;
  await audit.log({
    entity: "locations",
    op: result.change.op,
    recordId: result.locationId,
    stationId,
    old: result.change.op === "update" ? result.change.old : undefined,
    new: result.change.new,
    metadata: audit.entryMetadata,
  });
}

type ProposedCellSectorRef = {
  target_sector_id: number | null;
  sector_local_id: string | null;
  sector_unassigned?: boolean;
};

type ApprovalQueryClient = Pick<DbTx, "query">;
type SubmissionRow = NonNullable<Awaited<ReturnType<typeof db.query.submissions.findFirst>>>;
type ApprovalDraft = {
  type: SubmissionRow["type"];
  stationId: number | null;
  proposedStation: ProposedStationChanges | undefined;
  proposedLocation: { changes: ProposedLocationChanges; move: LocationMove } | undefined;
  proposedSectorRows: Pick<ProposedSectorRow, "operation" | "target_sector_id" | "local_id" | "azimuth">[];
  proposedCellRows: (Omit<z.infer<typeof proposedCellsSelectSchema>, "id" | "submission_id" | "station_id" | "createdAt" | "updatedAt"> & {
    gsm: z.infer<typeof gsmSelectSchema> | null;
    umts: z.infer<typeof umtsSelectSchema> | null;
    lte: z.infer<typeof lteSelectSchema> | null;
    nr: z.infer<typeof nrSelectSchema> | null;
  })[];
};
type ProposedCellRow = ApprovalDraft["proposedCellRows"][number];
type TargetCellRow = NonNullable<Awaited<ReturnType<typeof loadTargetCells>>[number]>;
type SubmissionPhotoRow = Awaited<ReturnType<DbTx["query"]["submissionPhotos"]["findMany"]>>[number];
type SubmissionLocationPhotoSelectionRow = Awaited<ReturnType<DbTx["query"]["submissionLocationPhotoSelections"]["findMany"]>>[number];
type ApprovalDuplicateCheckDraft = Pick<ApprovalDraft, "proposedStation" | "proposedCellRows">;
type ApprovalStationContext = { operatorId: number | null; stationStringId: string | null };
type CellAuditChanges = {
  added: number[];
  updated: { id: number; old: CellSnapshot }[];
  deleted: CellSnapshot[];
};
export type AppliedChange = { stationId: number | null; attachmentUuidsToDelete: string[]; cellChanges: CellAuditChanges; photosAdded: boolean };
type ApprovalOutcome = AppliedChange & { submission: SubmissionRow; stationStringId: string | null };

function resolveProposedCellSectorId(proposed: ProposedCellSectorRef, sectorIdByLocalId: ReadonlyMap<string, number>): number | null | undefined {
  if (proposed.target_sector_id !== null && proposed.target_sector_id !== undefined) return proposed.target_sector_id;
  if (proposed.sector_local_id) return sectorIdByLocalId.get(proposed.sector_local_id) ?? null;
  if (proposed.sector_unassigned) return null;
  return undefined;
}

async function findSiblingStationId(tx: DbTx, locationId: number, mnc: number | null | undefined): Promise<number | null> {
  const siblingMnc = getNetworksSiblingMnc(mnc);
  if (siblingMnc === null) return null;

  const [siblingStation] = await tx
    .select({ id: stations.id })
    .from(stations)
    .innerJoin(operators, eq(stations.operator_id, operators.id))
    .where(and(eq(stations.location_id, locationId), eq(operators.mnc, siblingMnc)))
    .limit(1);
  return siblingStation?.id ?? null;
}

function getProposedCellDetails(proposed: ProposedCellRow): Record<string, unknown> | null {
  return (proposed.lte ?? proposed.gsm ?? proposed.umts ?? proposed.nr) as Record<string, unknown> | null;
}

async function validatePublishedStation(submission: SubmissionRow): Promise<ApprovalStationContext | null> {
  if (submission.station_id === null) return null;

  const station = await db.query.stations.findFirst({
    where: { id: submission.station_id },
    columns: { status: true, operator_id: true, station_id: true },
  });
  if (!station || (station.status !== "published" && station.status !== "pending")) {
    throw new ErrorResponse("NOT_FOUND", { message: "Station not found" });
  }
  return { operatorId: station.operator_id, stationStringId: station.station_id ?? null };
}

async function loadProposedStationForApproval(client: ApprovalQueryClient, submissionId: string): Promise<ProposedStationChanges | undefined> {
  const row = await client.query.proposedStations.findFirst({ where: { submission_id: submissionId } });
  return row ? getProposedStationChanges(row) : undefined;
}

async function loadProposedCellsForApproval(client: ApprovalQueryClient, submissionId: string): Promise<ProposedCellRow[]> {
  return client.query.proposedCells.findMany({ where: { submission_id: submissionId }, with: { gsm: true, umts: true, lte: true, nr: true } });
}

async function loadApprovalDraft(tx: DbTx, submission: SubmissionRow, preloaded?: ApprovalDuplicateCheckDraft): Promise<ApprovalDraft> {
  const submissionId = submission.id;
  const [proposedStation, proposedLocation, proposedSectorRows, proposedCellRows] = await Promise.all([
    preloaded ? Promise.resolve(preloaded.proposedStation) : loadProposedStationForApproval(tx, submissionId),
    tx.query.proposedLocations.findFirst({ where: { submission_id: submissionId } }),
    tx.query.proposedSectors.findMany({ where: { submission_id: submissionId }, orderBy: { id: "asc" } }),
    preloaded ? Promise.resolve(preloaded.proposedCellRows) : loadProposedCellsForApproval(tx, submissionId),
  ]);

  return {
    type: submission.type,
    stationId: submission.station_id,
    proposedStation,
    proposedLocation: proposedLocation ? { changes: getProposedLocationChanges(proposedLocation), move: proposedLocation.move } : undefined,
    proposedSectorRows,
    proposedCellRows,
  };
}

async function loadApprovalDuplicateCheckDraft(submissionId: string): Promise<ApprovalDuplicateCheckDraft> {
  const [proposedStation, proposedCellRows] = await Promise.all([
    loadProposedStationForApproval(db, submissionId),
    loadProposedCellsForApproval(db, submissionId),
  ]);

  return { proposedStation, proposedCellRows };
}

async function createExtraIdentifierForNewStation(
  audit: AuditRecorder,
  proposedStation: NonNullable<ApprovalDraft["proposedStation"]>,
  stationId: number,
): Promise<void> {
  if (!proposedStation.networks_id && !proposedStation.networks_name && !proposedStation.mno_name) return;

  const [newIdentifier] = await audit.tx
    .insert(extraIdentificators)
    .values({
      station_id: stationId,
      networks_id: proposedStation.networks_id ?? null,
      networks_name: proposedStation.networks_name ?? null,
      mno_name: proposedStation.mno_name ?? null,
    })
    .returning();

  if (!newIdentifier) return;

  await audit.log({
    entity: "extra_identificators",
    op: "create",
    recordId: newIdentifier.id,
    stationId,
    new: newIdentifier,
    metadata: audit.entryMetadata,
  });
}

function extractUplinkFields(proposedStation: NonNullable<ApprovalDraft["proposedStation"]>) {
  const raw = proposedStation as Record<string, unknown>;
  return {
    type: raw.uplink_type as string | null | undefined,
    speed: (raw.uplink_speed as number) ?? null,
    model: (raw.uplink_model as string) ?? null,
  };
}

const stationUplinkSelectSchema = createSelectSchema(stationUplinks);
const stationInsertSchema = createInsertSchema(stations);

type UplinkValues = Pick<z.infer<typeof stationUplinkSelectSchema>, "type" | "speed" | "model">;

async function saveStationUplink(audit: AuditRecorder, stationId: number, values: UplinkValues): Promise<boolean> {
  const { tx } = audit;
  const existing = await tx.query.stationUplinks.findFirst({ where: { station_id: stationId } });
  if (existing && existing.type === values.type && existing.speed === values.speed && existing.model === values.model) return false;

  const [saved] = existing
    ? await tx
        .update(stationUplinks)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(stationUplinks.id, existing.id))
        .returning()
    : await tx
        .insert(stationUplinks)
        .values({ station_id: stationId, ...values })
        .returning();

  if (!saved) return false;

  await audit.log({
    entity: "station_uplinks",
    op: existing ? "update" : "create",
    recordId: saved.id,
    stationId,
    old: existing ?? null,
    new: saved,
    metadata: audit.entryMetadata,
  });
  return true;
}

async function syncSiblingUplink(audit: AuditRecorder, stationId: number, values: UplinkValues): Promise<void> {
  const { tx } = audit;
  const site = await loadStationSiteContext(tx, stationId);
  if (!site?.locationId) return;

  const siblingStationId = await findSiblingStationId(tx, site.locationId, site.mnc);
  if (siblingStationId === null) return;

  if (await saveStationUplink(audit, siblingStationId, values)) {
    await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, siblingStationId));
  }
}

async function createUplinkForNewStation(
  audit: AuditRecorder,
  proposedStation: NonNullable<ApprovalDraft["proposedStation"]>,
  stationId: number,
): Promise<void> {
  const { type, speed, model } = extractUplinkFields(proposedStation);
  if (!isUplinkType(type)) return;

  const values = { type, speed, model: type === "microwave" ? model : null };
  if (await saveStationUplink(audit, stationId, values)) await syncSiblingUplink(audit, stationId, values);
}

async function applyUplinkUpdate(audit: AuditRecorder, changes: ProposedStationChanges, stationId: number): Promise<void> {
  if (changes.uplink_type === undefined && changes.uplink_speed === undefined && changes.uplink_model === undefined) return;

  const { tx } = audit;
  const existing = await tx.query.stationUplinks.findFirst({ where: { station_id: stationId } });
  const proposedType = resolveChange(changes.uplink_type, existing?.type ?? null);

  if (proposedType === null) {
    if (!existing) return;
    await tx.delete(stationUplinks).where(eq(stationUplinks.id, existing.id));
    await audit.log({
      entity: "station_uplinks",
      op: "delete",
      recordId: existing.id,
      stationId,
      old: existing,
      metadata: audit.entryMetadata,
    });
    return;
  }

  const values = {
    type: proposedType,
    speed: resolveChange(changes.uplink_speed, existing?.speed ?? null),
    model: proposedType === "microwave" ? resolveChange(changes.uplink_model, existing?.model ?? null) : null,
  };

  if (await saveStationUplink(audit, stationId, values)) await syncSiblingUplink(audit, stationId, values);
}

async function createStationFromProposal(
  audit: AuditRecorder,
  proposedStation: NonNullable<ApprovalDraft["proposedStation"]>,
  locationId: number | null,
  proposedCellCount: number,
  isConfirmed: boolean,
): Promise<number> {
  const [newStation] = await audit.tx
    .insert(stations)
    .values({
      station_id: proposedStation.station_id ?? "",
      location_id: locationId,
      operator_id: proposedStation.operator_id,
      notes: typeof proposedStation.notes === "string" && proposedStation.notes.trim() !== "" ? proposedStation.notes : null,
      is_confirmed: isConfirmed,
      status: stationStatusForCellCount(proposedCellCount),
      statusChangedAt: new Date(),
    })
    .returning();
  if (!newStation) throw new ErrorResponse("FAILED_TO_CREATE", { message: "Failed to create station" });

  await audit.log({
    entity: "stations",
    op: "create",
    recordId: newStation.id,
    stationId: newStation.id,
    new: newStation,
    metadata: audit.entryMetadata,
  });

  await createExtraIdentifierForNewStation(audit, proposedStation, newStation.id);
  await createUplinkForNewStation(audit, proposedStation, newStation.id);
  return newStation.id;
}

async function applyNewSubmission(
  audit: AuditRecorder,
  draft: ApprovalDraft,
  isConfirmed: boolean,
): Promise<{ stationId: number | null; resolvedLocationId: number | null }> {
  let locationResult: UpsertLocationResult | null = null;

  if (draft.proposedLocation) locationResult = await upsertLocation(audit.tx, toLocationValues(draft.proposedLocation.changes));
  const locationId = locationResult?.locationId ?? null;

  let stationId: number | null = null;
  if (draft.proposedStation) {
    stationId = await createStationFromProposal(audit, draft.proposedStation, locationId, draft.proposedCellRows.length, isConfirmed);
  }
  if (locationResult) await logLocationChange(audit, locationResult, stationId);

  return { stationId, resolvedLocationId: locationId };
}

async function deleteEmptiedLocation(audit: AuditRecorder, currentLocation: LocationRow, stationId: number): Promise<void> {
  await audit.tx.delete(locations).where(eq(locations.id, currentLocation.id));
  await audit.log({
    entity: "locations",
    op: "delete",
    recordId: currentLocation.id,
    stationId,
    old: currentLocation,
    metadata: audit.entryMetadata,
  });
}

async function updateStationLocation(audit: AuditRecorder, stationId: number, locationId: number): Promise<void> {
  const previousStation = await audit.tx.query.stations.findFirst({ where: { id: stationId } });
  if (!previousStation) throw new ErrorResponse("NOT_FOUND", { message: "Station not found" });
  const [updatedStation] = await audit.tx
    .update(stations)
    .set({ location_id: locationId, updatedAt: new Date() })
    .where(eq(stations.id, stationId))
    .returning();
  if (!updatedStation) throw new ErrorResponse("FAILED_TO_UPDATE", { message: "Failed to update station location" });
  await audit.log({
    entity: "stations",
    op: "update",
    recordId: stationId,
    stationId,
    old: previousStation,
    new: updatedStation,
    metadata: audit.entryMetadata,
  });
}

async function updateLocationMetadata(
  audit: AuditRecorder,
  currentLocation: LocationRow,
  proposedLocation: LocationValues,
  stationId: number,
): Promise<void> {
  const regionChange = await resolveRegionChange(currentLocation, proposedLocation);
  const { location, createdOwner } = await resolveNamedOwner(audit.tx, proposedLocation, regionChange.region_id ?? currentLocation.region_id);
  await logCreatedOwner(audit, createdOwner, stationId);
  const structureChange = resolveStructureChange(currentLocation, location);
  const city = resolveChange(proposedLocation.city, currentLocation.city);
  const address = resolveChange(proposedLocation.address, currentLocation.address);
  const metadataChanged =
    regionChange.region_id !== undefined ||
    Object.keys(structureChange).length > 0 ||
    currentLocation.city !== city ||
    currentLocation.address !== address;

  if (!metadataChanged) return;

  await assertOwnerFitsAfterWrite(audit.tx, currentLocation, { ...currentLocation, ...regionChange, ...structureChange });
  const [updatedLocation] = await audit.tx
    .update(locations)
    .set({ ...regionChange, ...structureChange, city, address, updatedAt: new Date() })
    .where(eq(locations.id, currentLocation.id))
    .returning();
  if (!updatedLocation) throw new ErrorResponse("FAILED_TO_UPDATE", { message: "Failed to update location" });
  await audit.log({
    entity: "locations",
    op: "update",
    recordId: currentLocation.id,
    stationId,
    old: currentLocation,
    new: updatedLocation,
    metadata: audit.entryMetadata,
  });
}

type UpdatedLocationResult = { locationId: number; migratedPhotoIds: Map<number, number> };
type LocationMove = ProposedLocationRow["move"];

async function moveWholeLocation(
  audit: AuditRecorder,
  currentLocation: LocationRow,
  proposedLocation: LocationValues,
  locationAtNewCoords: LocationRow | undefined,
  stationId: number,
): Promise<UpdatedLocationResult> {
  const { tx } = audit;

  if (!locationAtNewCoords) {
    const regionId = await resolveRegionId(proposedLocation);
    const { location, createdOwner } = await resolveNamedOwner(tx, proposedLocation, regionId);
    const movedTo = { ...location, region_id: regionId };
    await assertOwnerFitsAfterWrite(tx, currentLocation, movedTo);
    const [movedLocation] = await tx
      .update(locations)
      .set({ ...movedTo, updatedAt: new Date() })
      .where(eq(locations.id, currentLocation.id))
      .returning();
    if (!movedLocation) throw new ErrorResponse("FAILED_TO_UPDATE", { message: "Failed to move location" });
    await logCreatedOwner(audit, createdOwner, stationId);
    await audit.log({
      entity: "locations",
      op: "update",
      recordId: currentLocation.id,
      stationId,
      old: currentLocation,
      new: movedLocation,
      metadata: audit.entryMetadata,
    });
    return { locationId: currentLocation.id, migratedPhotoIds: new Map() };
  }

  const locationResult = await upsertLocation(tx, proposedLocation, locationAtNewCoords);
  await logLocationChange(audit, locationResult, stationId);

  const residents = await tx.select({ id: stations.id }).from(stations).where(eq(stations.location_id, currentLocation.id)).orderBy(stations.id);
  const migratedPhotoIds = new Map<number, number>();
  /* eslint-disable no-await-in-loop */
  for (const [index, resident] of residents.entries()) {
    await updateStationLocation(audit, resident.id, locationResult.locationId);
    const migrated = await migrateStationPhotosToLocation(
      audit,
      resident.id,
      currentLocation.id,
      locationResult.locationId,
      index === residents.length - 1,
    );
    for (const [previousPhotoId, photoId] of migrated) migratedPhotoIds.set(previousPhotoId, photoId);
  }
  /* eslint-enable no-await-in-loop */
  await deleteEmptiedLocation(audit, currentLocation, stationId);

  return { locationId: locationResult.locationId, migratedPhotoIds };
}

async function applyUpdatedLocation(
  audit: AuditRecorder,
  changes: ProposedLocationChanges,
  stationId: number,
  move: LocationMove,
): Promise<UpdatedLocationResult> {
  const { tx } = audit;
  const currentStation = await tx.query.stations.findFirst({
    where: { id: stationId },
    with: { location: true },
  });

  const currentLocation = currentStation?.location ?? null;
  const proposedLocation = toLocationValues(currentLocation ? { ...currentLocation, ...changes } : changes);
  const coordsUnchanged =
    currentLocation && currentLocation.longitude === proposedLocation.longitude && currentLocation.latitude === proposedLocation.latitude;

  if (coordsUnchanged) {
    await updateLocationMetadata(audit, currentLocation, proposedLocation, stationId);
    return { locationId: currentLocation.id, migratedPhotoIds: new Map() };
  }

  const locationAtNewCoords = await tx.query.locations.findFirst({
    where: { AND: [{ longitude: proposedLocation.longitude }, { latitude: proposedLocation.latitude }] },
  });
  const targetLocation = locationAtNewCoords ? toLocationValues({ ...locationAtNewCoords, ...changes }) : proposedLocation;
  if (move === "location" && currentLocation) return moveWholeLocation(audit, currentLocation, targetLocation, locationAtNewCoords, stationId);

  const stationLocation = locationAtNewCoords ? targetLocation : withSentStructure(targetLocation, changes);
  const locationResult = await upsertLocation(tx, stationLocation, locationAtNewCoords ?? null);
  const locationId = locationResult.locationId;
  await logLocationChange(audit, locationResult, stationId);
  await updateStationLocation(audit, stationId, locationId);
  if (!currentLocation) return { locationId, migratedPhotoIds: new Map() };

  const [remainingResult] = await tx.select({ remaining: count() }).from(stations).where(eq(stations.location_id, currentLocation.id));
  const oldLocationOrphaned = Number(remainingResult?.remaining ?? 0) === 0;

  const migratedPhotoIds = await migrateStationPhotosToLocation(audit, stationId, currentLocation.id, locationId, oldLocationOrphaned);
  if (oldLocationOrphaned) await deleteEmptiedLocation(audit, currentLocation, stationId);

  return { locationId, migratedPhotoIds };
}

async function applyStationIdentityUpdate(audit: AuditRecorder, changes: ProposedStationChanges, stationId: number): Promise<void> {
  const { tx } = audit;
  const currentStation = await tx.query.stations.findFirst({
    where: { id: stationId },
  });
  if (!currentStation) return;

  const proposedNotes = normalizeText(changes.notes);
  const nextStationStringId =
    typeof changes.station_id === "string" && changes.station_id !== currentStation.station_id ? changes.station_id : undefined;
  const nextOperatorId =
    typeof changes.operator_id === "number" && changes.operator_id !== currentStation.operator_id ? changes.operator_id : undefined;
  const nextNotes = changes.notes !== undefined && proposedNotes !== normalizeText(currentStation.notes) ? proposedNotes : undefined;

  if (nextStationStringId === undefined && nextOperatorId === undefined && nextNotes === undefined) return;

  if (nextStationStringId !== undefined || nextOperatorId !== undefined) {
    const candidateStationStringId = nextStationStringId ?? currentStation.station_id;
    const candidateOperatorId = nextOperatorId ?? currentStation.operator_id;
    if (candidateOperatorId !== null) {
      const [duplicate] = await tx
        .select({ id: stations.id })
        .from(stations)
        .where(and(eq(stations.station_id, candidateStationStringId), eq(stations.operator_id, candidateOperatorId), ne(stations.id, stationId)))
        .limit(1);
      if (duplicate) throw new ErrorResponse("BAD_REQUEST", { message: "A station with the proposed station ID and operator already exists" });
    }
  }

  const updateValues: Partial<z.infer<typeof stationInsertSchema>> = { updatedAt: new Date() };
  if (nextStationStringId !== undefined) updateValues.station_id = nextStationStringId;
  if (nextOperatorId !== undefined) updateValues.operator_id = nextOperatorId;
  if (nextNotes !== undefined) updateValues.notes = nextNotes;

  const [updatedStation] = await tx.update(stations).set(updateValues).where(eq(stations.id, stationId)).returning();
  if (!updatedStation) throw new ErrorResponse("FAILED_TO_UPDATE", { message: "Failed to update station" });
  await audit.log({
    entity: "stations",
    op: "update",
    recordId: stationId,
    stationId,
    old: currentStation,
    new: updatedStation,
    metadata: audit.entryMetadata,
  });
}

async function applyExtraIdentifierUpdate(audit: AuditRecorder, changes: ProposedStationChanges, stationId: number): Promise<void> {
  if (changes.networks_id === undefined && changes.networks_name === undefined && changes.mno_name === undefined) return;

  const { tx } = audit;
  const existingIdentifier = await tx.query.extraIdentificators.findFirst({ where: { station_id: stationId } });
  const proposedNetworksId = resolveChange(changes.networks_id, existingIdentifier?.networks_id ?? null);
  const proposedNetworksName = normalizeText(resolveChange(changes.networks_name, existingIdentifier?.networks_name ?? null));
  const proposedMnoName = normalizeText(resolveChange(changes.mno_name, existingIdentifier?.mno_name ?? null));

  if (proposedNetworksId === null && proposedNetworksName === null && proposedMnoName === null) {
    if (!existingIdentifier) return;
    await tx.delete(extraIdentificators).where(eq(extraIdentificators.id, existingIdentifier.id));
    await audit.log({
      entity: "extra_identificators",
      op: "delete",
      recordId: existingIdentifier.id,
      stationId,
      old: existingIdentifier,
      metadata: audit.entryMetadata,
    });
    return;
  }

  const hasIdentifierChanges =
    !existingIdentifier ||
    existingIdentifier.networks_id !== proposedNetworksId ||
    existingIdentifier.networks_name !== proposedNetworksName ||
    existingIdentifier.mno_name !== proposedMnoName;

  if (!hasIdentifierChanges) return;

  const [updatedIdentifier] = existingIdentifier
    ? await tx
        .update(extraIdentificators)
        .set({
          networks_id: proposedNetworksId,
          networks_name: proposedNetworksName,
          mno_name: proposedMnoName,
          updatedAt: new Date(),
        })
        .where(eq(extraIdentificators.id, existingIdentifier.id))
        .returning()
    : await tx
        .insert(extraIdentificators)
        .values({
          station_id: stationId,
          networks_id: proposedNetworksId,
          networks_name: proposedNetworksName,
          mno_name: proposedMnoName,
        })
        .returning();

  if (!updatedIdentifier) return;

  await audit.log({
    entity: "extra_identificators",
    op: existingIdentifier ? "update" : "create",
    recordId: updatedIdentifier.id,
    stationId,
    old: existingIdentifier,
    new: updatedIdentifier,
    metadata: audit.entryMetadata,
  });
}

async function applyDeletedSubmission(audit: AuditRecorder, stationId: number | null): Promise<void> {
  if (!stationId) throw new ErrorResponse("BAD_REQUEST", { message: "Cannot delete without a station" });

  const previousStation = await audit.tx.query.stations.findFirst({ where: { id: stationId } });
  if (!previousStation) throw new ErrorResponse("NOT_FOUND", { message: "Station not found" });
  const [updatedStation] = await audit.tx.update(stations).set(stationStatusUpdate("inactive")).where(eq(stations.id, stationId)).returning();
  if (!updatedStation) throw new ErrorResponse("FAILED_TO_UPDATE", { message: "Failed to deactivate station" });
  await audit.log({
    entity: "stations",
    op: "update",
    recordId: stationId,
    stationId,
    old: previousStation,
    new: updatedStation,
    metadata: audit.entryMetadata,
  });
}

async function loadTargetCells(tx: DbTx, proposedCellRows: ProposedCellRow[]) {
  const targetCellIds = proposedCellRows
    .filter((cell) => (cell.operation === "update" || cell.operation === "delete") && cell.target_cell_id)
    .map((cell) => cell.target_cell_id!);

  if (targetCellIds.length === 0) return [];

  return tx.query.cells.findMany({
    where: { id: { in: targetCellIds } },
    with: { gsm: true, umts: true, lte: true, nr: true },
  });
}

function getApprovalOperatorId(
  submission: SubmissionRow,
  proposedStation: ApprovalDraft["proposedStation"],
  stationContext: ApprovalStationContext | null,
): number | null {
  if (submission.type === "new") return proposedStation?.operator_id ?? null;
  return stationContext?.operatorId ?? null;
}

async function checkApprovalCellDuplicates(
  submission: SubmissionRow,
  draft: ApprovalDuplicateCheckDraft,
  stationContext: ApprovalStationContext | null,
): Promise<void> {
  const duplicateEntries = draft.proposedCellRows
    .filter((cell) => cell.operation !== "delete" && cell.rat)
    .map((cell) => ({ rat: cell.rat!, details: getProposedCellDetails(cell), excludeCellId: cell.target_cell_id ?? undefined }))
    .filter((entry): entry is typeof entry & { details: Record<string, unknown> } => entry.details !== null);
  const operatorId = getApprovalOperatorId(submission, draft.proposedStation, stationContext);

  if (!operatorId) return;
  if (duplicateEntries.length > 0) await checkCellDuplicatesBatch(duplicateEntries, operatorId);
}

async function applyProposedSectors(
  tx: DbTx,
  stationId: number | null,
  proposedSectorRows: ApprovalDraft["proposedSectorRows"],
): Promise<{
  sectorIdByLocalId: Map<string, number>;
  sectorIdsToDeleteAfterCells: number[];
  previousSectors: SectorSnapshot[] | null;
}> {
  const sectorIdByLocalId = new Map<string, number>();
  if (!stationId || proposedSectorRows.length === 0) return { sectorIdByLocalId, sectorIdsToDeleteAfterCells: [], previousSectors: null };

  const previousSectors = await loadSectorSnapshot(tx, stationId);
  const { changes, unchangedSectorIdByLocalId } = resolveSectorChanges(proposedSectorRows, previousSectors);
  for (const [localId, sectorId] of unchangedSectorIdByLocalId) sectorIdByLocalId.set(localId, sectorId);

  const finalAzimuthById = new Map(previousSectors.map((sector) => [sector.id, sector.azimuth]));
  const sectorIdsToDeleteAfterCells: number[] = [];
  for (const change of changes) {
    const targetId = change.target_sector_id;
    if (change.operation === "add" || targetId === null || !finalAzimuthById.has(targetId)) continue;
    sectorIdByLocalId.set(change.local_id, targetId);
    if (change.operation === "delete") {
      finalAzimuthById.delete(targetId);
      sectorIdsToDeleteAfterCells.push(targetId);
    } else finalAzimuthById.set(targetId, change.azimuth);
  }

  const keptAzimuths = new Set(finalAzimuthById.values());
  if (keptAzimuths.size !== finalAzimuthById.size) throw new ErrorResponse("BAD_REQUEST", { message: "Azimuth values must be unique" });
  const additions = changes.filter((change) => change.operation === "add");
  const insertedAzimuths = [...new Set(additions.map((change) => change.azimuth))].filter((azimuth) => !keptAzimuths.has(azimuth));
  const sectorIdByAzimuth = await writeSectorAzimuths(tx, stationId, previousSectors, finalAzimuthById, insertedAzimuths);

  for (const change of additions) {
    const sectorId = sectorIdByAzimuth.get(change.azimuth);
    if (sectorId !== undefined) sectorIdByLocalId.set(change.local_id, sectorId);
  }

  return { sectorIdByLocalId, sectorIdsToDeleteAfterCells, previousSectors };
}

async function checkProposedPciDuplicates(stationId: number | null, proposedCellRows: ProposedCellRow[]): Promise<void> {
  if (!stationId) return;

  const allModifiedCellIds = proposedCellRows.map((cell) => cell.target_cell_id).filter((id): id is number => id !== null && id !== undefined);
  await checkPciDuplicates(
    stationId,
    proposedCellRows
      .filter((cell) => cell.operation !== "delete")
      .map((cell) => ({
        rat: cell.rat,
        bandId: cell.band_id,
        details: cell.rat === "LTE" ? cell.lte : cell.nr,
        excludeCellId: cell.target_cell_id ?? undefined,
      })),
    allModifiedCellIds,
  );
}

function getProposedRATDetails(proposed: ProposedCellRow, rat: NormalRat): ProposedCellRow["gsm" | "umts" | "lte" | "nr"] | null {
  switch (rat) {
    case "GSM":
      return proposed.gsm ?? null;
    case "UMTS":
      return proposed.umts ?? null;
    case "LTE":
      return proposed.lte ?? null;
    case "NR":
      return proposed.nr ?? null;
  }
}

async function insertCellDetails(tx: DbTx, proposed: ProposedCellRow, cellId: number, features: CountryFeatures): Promise<RATCellDetailsRow | null> {
  if (!proposed.rat || !isNormalRat(proposed.rat)) return null;

  const details = getProposedRATDetails(proposed, proposed.rat);
  if (!details) return null;

  return insertRATCellDetailsReturning(tx, proposed.rat, cellId, details as RATInsertDetails, features);
}

function withKnownGnbidLength<Details extends object>(proposedDetails: Details): Details {
  if (!("gnbid_length" in proposedDetails)) return proposedDetails;
  return { ...proposedDetails, gnbid_length: proposedDetails.gnbid_length ?? undefined };
}

async function updateCellDetails(
  tx: DbTx,
  proposed: ProposedCellRow,
  targetCell: TargetCellRow,
  features: CountryFeatures,
): Promise<RATCellDetailsRow | null> {
  const rat = proposed.rat ?? targetCell.rat;
  if (!isNormalRat(rat)) return null;

  const details = getProposedRATDetails(proposed, rat);
  if (!details) return null;

  return updateRATCellDetailsReturning(tx, rat, targetCell.id, withKnownGnbidLength(details) as RATUpdateDetails, features);
}

async function addProposedCell(
  tx: DbTx,
  proposed: ProposedCellRow,
  stationId: number | null,
  sectorIdByLocalId: ReadonlyMap<string, number>,
  features: CountryFeatures,
): Promise<number> {
  if (!stationId) throw new ErrorResponse("BAD_REQUEST", { message: "Cannot add cell without a station" });
  if (!proposed.rat) throw new ErrorResponse("BAD_REQUEST", { message: "Cannot add cell without RAT" });
  if (!proposed.band_id) throw new ErrorResponse("BAD_REQUEST", { message: "Cannot add cell without band" });

  const sectorId = resolveProposedCellSectorId(proposed, sectorIdByLocalId);
  const [newCell] = await tx
    .insert(cells)
    .values({
      station_id: stationId,
      band_id: proposed.band_id,
      sector_id: sectorId ?? null,
      rat: proposed.rat,
      type: proposed.type ?? null,
      notes: proposed.notes,
      is_confirmed: proposed.is_confirmed,
    })
    .returning();
  if (!newCell) throw new ErrorResponse("FAILED_TO_CREATE", { message: "Failed to create cell" });

  await insertCellDetails(tx, proposed, newCell.id, features);
  return newCell.id;
}

async function updateProposedCell(
  tx: DbTx,
  proposed: ProposedCellRow,
  targetCellsMap: ReadonlyMap<number, TargetCellRow>,
  sectorIdByLocalId: ReadonlyMap<string, number>,
  changeCells: readonly ChangeCell[],
  countryFeatures: ReadonlyMap<number, CountryFeatures>,
): Promise<{ id: number; old: CellSnapshot }> {
  const targetCellId = proposed.target_cell_id;
  if (!targetCellId) throw new ErrorResponse("BAD_REQUEST", { message: "A cell update does not say which cell to update" });

  const targetCell = targetCellsMap.get(targetCellId);
  if (!targetCell) throw new ErrorResponse("NOT_FOUND", { message: `Target cell ${targetCellId} not found` });
  if (proposed.rat && proposed.rat !== targetCell.rat) {
    throw new ErrorResponse("CONFLICT", {
      message: `A cell's technology cannot be changed; cell ${targetCellId} is ${targetCell.rat}, not ${proposed.rat}`,
    });
  }
  const edited = changeCells.find((cell) => cell.target_cell_id === targetCellId);

  const cellUpdate: Record<string, unknown> = { updatedAt: new Date() };
  if (proposed.band_id) cellUpdate.band_id = proposed.band_id;
  if (proposed.type !== undefined) cellUpdate.type = proposed.type;
  if (proposed.notes !== null) cellUpdate.notes = normalizeText(proposed.notes);
  const sectorId = resolveProposedCellSectorId(proposed, sectorIdByLocalId);
  if (sectorId !== undefined) cellUpdate.sector_id = sectorId;
  if (edited?.is_confirmed !== undefined && edited.is_confirmed !== targetCell.is_confirmed) cellUpdate.is_confirmed = edited.is_confirmed;
  if (edited?.destination_station_id !== undefined) {
    cellUpdate.station_id = edited.destination_station_id;
    cellUpdate.sector_id = null;
  }

  await tx.update(cells).set(cellUpdate).where(eq(cells.id, targetCellId));

  const destinationStationId = edited?.destination_station_id ?? targetCell.station_id;
  await updateCellDetails(tx, proposed, targetCell, countryFeatures.get(destinationStationId) ?? disabledCountryFeatures);
  return { id: targetCellId, old: flattenCellRow(targetCell) };
}

async function deleteProposedCell(tx: DbTx, proposed: ProposedCellRow, targetCellsMap: ReadonlyMap<number, TargetCellRow>): Promise<CellSnapshot> {
  const targetCellId = proposed.target_cell_id;
  if (!targetCellId) throw new ErrorResponse("BAD_REQUEST", { message: "A cell deletion does not say which cell to delete" });

  const targetCell = targetCellsMap.get(targetCellId);
  if (!targetCell) throw new ErrorResponse("NOT_FOUND", { message: `Target cell ${targetCellId} not found` });

  const snapshot = flattenCellRow(targetCell);
  await tx.delete(cells).where(eq(cells.id, targetCellId));
  return snapshot;
}

async function applyProposedCells(
  tx: DbTx,
  proposedCellRows: ProposedCellRow[],
  stationId: number | null,
  targetCellsMap: ReadonlyMap<number, TargetCellRow>,
  sectorIdByLocalId: ReadonlyMap<string, number>,
  changeCells: readonly ChangeCell[],
): Promise<CellAuditChanges> {
  const changes: CellAuditChanges = { added: [], updated: [], deleted: [] };
  const writeTasks: (() => Promise<void>)[] = [];
  const countryFeatures = await getStationCountryFeatures(
    unique([stationId, ...changeCells.map((cell) => cell.destination_station_id), ...[...targetCellsMap.values()].map((cell) => cell.station_id)]),
    tx,
  );
  const stationFeatures = stationId === null ? disabledCountryFeatures : (countryFeatures.get(stationId) ?? disabledCountryFeatures);

  for (const proposed of proposedCellRows) {
    switch (proposed.operation) {
      case "add":
        writeTasks.push(() =>
          addProposedCell(tx, proposed, stationId, sectorIdByLocalId, stationFeatures).then((added) => {
            changes.added.push(added);
          }),
        );
        break;
      case "update":
        writeTasks.push(() =>
          updateProposedCell(tx, proposed, targetCellsMap, sectorIdByLocalId, changeCells, countryFeatures).then((updated) => {
            changes.updated.push(updated);
          }),
        );
        break;
      case "delete":
        writeTasks.push(() =>
          deleteProposedCell(tx, proposed, targetCellsMap).then((deleted) => {
            changes.deleted.push(deleted);
          }),
        );
        break;
    }
  }

  await writeTasks.reduce((previous, writeTask) => previous.then(writeTask), Promise.resolve());

  return changes;
}

async function deleteUnretainedSectors(tx: DbTx, stationId: number | null, sectorIdsToDelete: number[]): Promise<void> {
  if (!stationId || sectorIdsToDelete.length === 0) return;

  const [assignedResult] = await tx.select({ value: count() }).from(cells).where(inArray(cells.sector_id, sectorIdsToDelete));
  if (Number(assignedResult?.value ?? 0) > 0)
    throw new ErrorResponse("BAD_REQUEST", { message: "Cannot delete sectors that still have cells assigned" });
  await tx.delete(stationSectors).where(inArray(stationSectors.id, sectorIdsToDelete));
}

async function finishSectorChange(audit: AuditRecorder, stationId: number | null, previousSectors: SectorSnapshot[] | null): Promise<void> {
  if (!stationId || previousSectors === null) return;

  const nextSectors = await loadSectorSnapshot(audit.tx, stationId);
  const unchanged =
    nextSectors.length === previousSectors.length &&
    nextSectors.every((sector, index) => sector.id === previousSectors[index]?.id && sector.azimuth === previousSectors[index]?.azimuth);
  if (unchanged) return;

  await audit.log({
    entity: "station_sectors",
    op: "update",
    recordId: null,
    stationId,
    old: previousSectors,
    new: nextSectors,
    metadata: audit.entryMetadata,
  });
  await syncSiblingSectors(audit, stationId, previousSectors, nextSectors);
}

function renamedAzimuths(previousSectors: readonly SectorSnapshot[], nextSectors: readonly SectorSnapshot[]): Map<number, number> {
  const nextAzimuthById = new Map(nextSectors.map((sector) => [sector.id, sector.azimuth]));
  return new Map(
    previousSectors.flatMap((sector) => {
      const azimuth = nextAzimuthById.get(sector.id);
      return azimuth !== undefined && azimuth !== sector.azimuth ? [[sector.azimuth, azimuth] as const] : [];
    }),
  );
}

async function repointSiblingCells(
  audit: AuditRecorder,
  siblingSectors: readonly SectorSnapshot[],
  sectorIdByAzimuth: ReadonlyMap<number, number>,
  renamed: ReadonlyMap<number, number>,
): Promise<void> {
  const { tx } = audit;
  const azimuthBySectorId = new Map(siblingSectors.map((sector) => [sector.id, sector.azimuth]));
  if (azimuthBySectorId.size === 0) return;

  const assignedCells = await tx
    .select({ id: cells.id, sectorId: cells.sector_id })
    .from(cells)
    .where(inArray(cells.sector_id, [...azimuthBySectorId.keys()]));
  const cellIdsBySectorId = new Map<number | null, number[]>();
  for (const cell of assignedCells) {
    const azimuth = cell.sectorId === null ? undefined : azimuthBySectorId.get(cell.sectorId);
    if (azimuth === undefined) continue;
    const followedAzimuth = sectorIdByAzimuth.has(azimuth) ? azimuth : renamed.get(azimuth);
    const sectorId = followedAzimuth === undefined ? null : (sectorIdByAzimuth.get(followedAzimuth) ?? null);
    if (sectorId !== cell.sectorId) cellIdsBySectorId.set(sectorId, [...(cellIdsBySectorId.get(sectorId) ?? []), cell.id]);
  }

  const movedCellIds = [...cellIdsBySectorId.values()].flat();
  if (movedCellIds.length === 0) return;

  const previousSnapshots = await loadCellSnapshots(tx, movedCellIds);
  await Promise.all(
    [...cellIdsBySectorId].map(([sectorId, cellIds]) =>
      tx.update(cells).set({ sector_id: sectorId, updatedAt: new Date() }).where(inArray(cells.id, cellIds)),
    ),
  );
  const nextSnapshots = await loadCellSnapshots(tx, movedCellIds);
  await audit.logMany(
    movedCellIds.flatMap((cellId) => {
      const old = previousSnapshots.get(cellId);
      const snapshot = nextSnapshots.get(cellId);
      if (!old || !snapshot) return [];
      return [
        {
          entity: "cells" as const,
          op: "update" as const,
          recordId: cellId,
          stationId: snapshot.station_id,
          old,
          new: snapshot,
          metadata: audit.entryMetadata,
        },
      ];
    }),
  );
}

async function syncSiblingSectors(
  audit: AuditRecorder,
  stationId: number,
  previousSectors: readonly SectorSnapshot[],
  nextSectors: readonly SectorSnapshot[],
): Promise<void> {
  const { tx } = audit;
  const site = await loadStationSiteContext(tx, stationId);
  if (!site?.locationId) return;
  const siblingStationId = await findSiblingStationId(tx, site.locationId, site.mnc);
  if (siblingStationId === null) return;

  const siblingSectors = await loadSectorSnapshot(tx, siblingStationId);
  const inSync =
    siblingSectors.length === nextSectors.length && siblingSectors.every((sector, index) => sector.azimuth === nextSectors[index]?.azimuth);
  if (inSync) return;

  const finalAzimuthById = new Map<number, number>();
  const insertedAzimuths: number[] = [];
  for (const [index, sector] of nextSectors.entries()) {
    const slot = siblingSectors[index];
    if (slot) finalAzimuthById.set(slot.id, sector.azimuth);
    else insertedAzimuths.push(sector.azimuth);
  }
  const sectorIdByAzimuth = await writeSectorAzimuths(tx, siblingStationId, siblingSectors, finalAzimuthById, insertedAzimuths);
  await repointSiblingCells(audit, siblingSectors, sectorIdByAzimuth, renamedAzimuths(previousSectors, nextSectors));

  const removedSectorIds = siblingSectors.slice(nextSectors.length).map((sector) => sector.id);
  if (removedSectorIds.length > 0) await tx.delete(stationSectors).where(inArray(stationSectors.id, removedSectorIds));

  const syncedSectors = await loadSectorSnapshot(tx, siblingStationId);
  await audit.log({
    entity: "station_sectors",
    op: "update",
    recordId: null,
    stationId: siblingStationId,
    old: siblingSectors,
    new: syncedSectors,
    metadata: audit.entryMetadata,
  });
  await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, siblingStationId));
}

async function logCellChanges(audit: AuditRecorder, changes: CellAuditChanges): Promise<void> {
  const newSnapshots = await loadCellSnapshots(audit.tx, [...changes.added, ...changes.updated.map(({ id }) => id)]);
  const requireSnapshot = (cellId: number) => {
    const snapshot = newSnapshots.get(cellId);
    if (!snapshot) throw new ErrorResponse("FAILED_TO_UPDATE", { message: `Failed to load cell ${cellId} after approval` });
    return snapshot;
  };

  await audit.logMany([
    ...changes.added.map((cellId) => {
      const snapshot = requireSnapshot(cellId);
      return {
        entity: "cells" as const,
        op: "create" as const,
        recordId: cellId,
        stationId: snapshot.station_id,
        new: snapshot,
        metadata: audit.entryMetadata,
      };
    }),
    ...changes.updated.map(({ id: cellId, old }) => {
      const snapshot = requireSnapshot(cellId);
      return {
        entity: "cells" as const,
        op: "update" as const,
        recordId: cellId,
        stationId: snapshot.station_id,
        old,
        new: snapshot,
        metadata: audit.entryMetadata,
      };
    }),
    ...changes.deleted.map((snapshot) => ({
      entity: "cells" as const,
      op: "delete" as const,
      recordId: snapshot.id,
      stationId: snapshot.station_id,
      old: snapshot,
      metadata: audit.entryMetadata,
    })),
  ]);
}

async function loadStationSiteContext(tx: DbTx, stationId: number): Promise<{ locationId: number | null; mnc: number | null } | null> {
  const [stationPhotoContext] = await tx
    .select({ locationId: stations.location_id, mnc: operators.mnc })
    .from(stations)
    .leftJoin(operators, eq(stations.operator_id, operators.id))
    .where(eq(stations.id, stationId))
    .limit(1);
  return stationPhotoContext ?? null;
}

async function applyUploadedSubmissionPhotos(
  audit: AuditRecorder,
  submission: SubmissionRow,
  stationId: number,
  resolvedLocationId: number | null,
  photos: SubmissionPhotoRow[],
  previousSelections: PhotoSelectionSnapshots,
): Promise<boolean> {
  if (photos.length === 0) return false;
  const { tx } = audit;

  let stationPhotoContext: Awaited<ReturnType<typeof loadStationSiteContext>> = null;
  let photoLocationId = resolvedLocationId;
  if (!photoLocationId) {
    stationPhotoContext = await loadStationSiteContext(tx, stationId);
    photoLocationId = stationPhotoContext?.locationId ?? null;
  }
  if (!photoLocationId) return false;

  const attachmentIds = photos.map((photo) => photo.attachment_id);
  const existingRows = await tx
    .select()
    .from(locationPhotos)
    .where(and(eq(locationPhotos.location_id, photoLocationId), inArray(locationPhotos.attachment_id, attachmentIds)));

  const existingAttachmentIds = new Set(existingRows.map((row) => row.attachment_id));
  const newPhotoValues = photos
    .filter((photo) => !existingAttachmentIds.has(photo.attachment_id))
    .map((photo) => ({
      location_id: photoLocationId,
      attachment_id: photo.attachment_id,
      submission_id: submission.id,
      uploaded_by: submission.submitter_id,
      note: photo.note,
      taken_at: photo.taken_at,
    }));
  const insertedRows = newPhotoValues.length > 0 ? await tx.insert(locationPhotos).values(newPhotoValues).returning() : [];
  await audit.logMany(
    insertedRows.map((photo) => ({
      entity: "location_photos",
      op: "create",
      recordId: photo.id,
      stationId,
      new: photo,
      metadata: audit.entryMetadata,
    })),
  );

  const unorderedRows = [...existingRows, ...insertedRows];

  if (unorderedRows.length === 0) return false;

  const rowsByAttachment = new Map(unorderedRows.map((row) => [row.attachment_id, row.id]));
  const locationPhotoRows = photos
    .map((photo) => ({ id: rowsByAttachment.get(photo.attachment_id), is_main: photo.is_main }))
    .filter((row): row is { id: number; is_main: boolean } => row.id !== undefined);

  if (locationPhotoRows.length === 0) return false;

  const explicitMainId = locationPhotoRows.find((row) => row.is_main)?.id ?? null;

  const [existingMain, loadedStationPhotoContext] = await Promise.all([
    tx.query.stationPhotoSelections.findFirst({
      where: { station_id: stationId, is_main: true },
    }),
    stationPhotoContext ? Promise.resolve(stationPhotoContext) : loadStationSiteContext(tx, stationId),
  ]);

  const resolveIsMain = (locationPhotoId: number, index: number, hasExistingMain: boolean) =>
    explicitMainId !== null ? locationPhotoId === explicitMainId : !hasExistingMain && index === 0;

  await tx
    .insert(stationPhotoSelections)
    .values(
      locationPhotoRows.map((locationPhoto, index) => ({
        station_id: stationId,
        location_photo_id: locationPhoto.id,
        is_main: resolveIsMain(locationPhoto.id, index, !!existingMain),
      })),
    )
    .onConflictDoNothing();

  if (explicitMainId !== null) await forceMainSelection(tx, stationId, explicitMainId);

  const siblingStationId = await findSiblingStationId(tx, photoLocationId, loadedStationPhotoContext?.mnc);
  if (siblingStationId === null) return explicitMainId !== null;

  const siblingPreviousSelections = await loadPhotoSelectionSnapshots(tx, [siblingStationId]);
  previousSelections.set(siblingStationId, siblingPreviousSelections.get(siblingStationId) ?? []);

  const siblingExistingMain = await tx.query.stationPhotoSelections.findFirst({
    where: { station_id: siblingStationId, is_main: true },
  });
  await tx
    .insert(stationPhotoSelections)
    .values(
      locationPhotoRows.map((locationPhoto, index) => ({
        station_id: siblingStationId,
        location_photo_id: locationPhoto.id,
        is_main: resolveIsMain(locationPhoto.id, index, !!siblingExistingMain),
      })),
    )
    .onConflictDoNothing();

  if (explicitMainId !== null) await forceMainSelection(tx, siblingStationId, explicitMainId);

  return explicitMainId !== null;
}

async function forceMainSelection(tx: DbTx, stationId: number, locationPhotoId: number): Promise<void> {
  await tx.update(stationPhotoSelections).set({ is_main: false }).where(eq(stationPhotoSelections.station_id, stationId));
  await tx
    .update(stationPhotoSelections)
    .set({ is_main: true })
    .where(and(eq(stationPhotoSelections.station_id, stationId), eq(stationPhotoSelections.location_photo_id, locationPhotoId)));
}

async function resolvePhotoSelectionsToLocation(
  audit: AuditRecorder,
  locationPhotoSels: SubmissionLocationPhotoSelectionRow[],
  stationLocationId: number,
  stationId: number,
): Promise<SubmissionLocationPhotoSelectionRow[]> {
  const { tx } = audit;
  const requestedIds = locationPhotoSels.map((selection) => selection.location_photo_id);
  const photoRows = await tx.select().from(locationPhotos).where(inArray(locationPhotos.id, requestedIds));
  const photoById = new Map(photoRows.map((row) => [row.id, row]));

  const resolvedSels: SubmissionLocationPhotoSelectionRow[] = [];
  const resolvedIds = new Set<number>();
  /* eslint-disable no-await-in-loop */
  for (const selection of locationPhotoSels) {
    const photo = photoById.get(selection.location_photo_id);
    if (!photo) continue;

    let targetId: number | undefined = photo.location_id === stationLocationId ? photo.id : undefined;
    if (targetId === undefined) {
      const [existingCopy] = await tx
        .select({ id: locationPhotos.id })
        .from(locationPhotos)
        .where(and(eq(locationPhotos.location_id, stationLocationId), eq(locationPhotos.attachment_id, photo.attachment_id)));
      targetId = existingCopy?.id;
    }
    if (targetId === undefined) {
      const [copy] = await tx
        .insert(locationPhotos)
        .values({
          location_id: stationLocationId,
          attachment_id: photo.attachment_id,
          submission_id: photo.submission_id,
          uploaded_by: photo.uploaded_by,
          note: photo.note,
          taken_at: photo.taken_at,
        })
        .returning();
      targetId = copy?.id;
      if (copy)
        await audit.log({
          entity: "location_photos",
          op: "create",
          recordId: copy.id,
          stationId,
          new: copy,
          metadata: audit.entryMetadata,
        });
    }
    if (targetId === undefined || resolvedIds.has(targetId)) continue;
    resolvedIds.add(targetId);
    resolvedSels.push({ ...selection, location_photo_id: targetId });
  }
  /* eslint-enable no-await-in-loop */
  return resolvedSels;
}

async function applyLocationPhotoSelections(
  audit: AuditRecorder,
  locationPhotoSels: SubmissionLocationPhotoSelectionRow[],
  stationId: number,
  stationLocationId: number | null,
  uploadedMainApplied: boolean,
): Promise<void> {
  if (locationPhotoSels.length === 0 || stationLocationId === null) return;
  const { tx } = audit;

  const resolvedSels = await resolvePhotoSelectionsToLocation(audit, locationPhotoSels, stationLocationId, stationId);
  if (resolvedSels.length === 0) return;

  const resolvedPhotoIds = resolvedSels.map((selection) => selection.location_photo_id);
  const existingRows = await tx
    .select({ location_photo_id: stationPhotoSelections.location_photo_id })
    .from(stationPhotoSelections)
    .where(and(eq(stationPhotoSelections.station_id, stationId), inArray(stationPhotoSelections.location_photo_id, resolvedPhotoIds)));
  const existingIds = new Set(existingRows.map((row) => row.location_photo_id));
  const toInsert = resolvedSels.filter((selection) => !existingIds.has(selection.location_photo_id));

  const mainSel = uploadedMainApplied ? undefined : resolvedSels.find((selection) => selection.is_main);
  const mainIsAlreadyAssigned = mainSel !== undefined && existingIds.has(mainSel.location_photo_id);

  if (toInsert.length > 0) {
    const existingMain = await tx.query.stationPhotoSelections.findFirst({
      where: { station_id: stationId, is_main: true },
    });
    await tx.insert(stationPhotoSelections).values(
      toInsert.map((selection) => ({
        station_id: stationId,
        location_photo_id: selection.location_photo_id,
        is_main: !existingMain && !mainIsAlreadyAssigned && !uploadedMainApplied && selection.is_main,
      })),
    );
  }

  if (!mainIsAlreadyAssigned) return;

  await forceMainSelection(tx, stationId, mainSel.location_photo_id);
}

async function applyLocationPhotoRemovals(
  audit: AuditRecorder,
  removalPhotoIds: number[],
  stationId: number,
  stationLocationId: number | null,
): Promise<string[]> {
  if (removalPhotoIds.length === 0) return [];
  const { tx } = audit;

  const [wasMain] = await tx
    .select({ id: stationPhotoSelections.id })
    .from(stationPhotoSelections)
    .where(
      and(
        eq(stationPhotoSelections.station_id, stationId),
        inArray(stationPhotoSelections.location_photo_id, removalPhotoIds),
        eq(stationPhotoSelections.is_main, true),
      ),
    )
    .limit(1);

  await tx
    .delete(stationPhotoSelections)
    .where(and(eq(stationPhotoSelections.station_id, stationId), inArray(stationPhotoSelections.location_photo_id, removalPhotoIds)));

  if (wasMain) {
    const [first] = await tx
      .select({ id: stationPhotoSelections.id })
      .from(stationPhotoSelections)
      .where(eq(stationPhotoSelections.station_id, stationId))
      .limit(1);
    if (first) await tx.update(stationPhotoSelections).set({ is_main: true }).where(eq(stationPhotoSelections.id, first.id));
  }

  if (stationLocationId === null) return [];

  const orphanedPhotos = await tx
    .select({ photo: locationPhotos })
    .from(locationPhotos)
    .leftJoin(stationPhotoSelections, eq(stationPhotoSelections.location_photo_id, locationPhotos.id))
    .where(and(inArray(locationPhotos.id, removalPhotoIds), eq(locationPhotos.location_id, stationLocationId), isNull(stationPhotoSelections.id)));

  if (orphanedPhotos.length === 0) return [];

  const orphanIds = orphanedPhotos.map(({ photo }) => photo.id);
  const orphanAttachmentIds = orphanedPhotos.map(({ photo }) => photo.attachment_id);

  await tx.delete(locationPhotos).where(inArray(locationPhotos.id, orphanIds));
  await audit.logMany(
    orphanedPhotos.map(({ photo }) => ({
      entity: "location_photos",
      op: "delete",
      recordId: photo.id,
      stationId,
      old: photo,
      metadata: audit.entryMetadata,
    })),
  );

  const stillReferenced = await tx
    .select({ attachment_id: locationPhotos.attachment_id })
    .from(locationPhotos)
    .where(inArray(locationPhotos.attachment_id, orphanAttachmentIds));
  const stillReferencedIds = new Set(stillReferenced.map((row) => row.attachment_id));
  const deletableAttachmentIds = orphanAttachmentIds.filter((attachmentId) => !stillReferencedIds.has(attachmentId));
  if (deletableAttachmentIds.length === 0) return [];

  const attachmentRows = await tx.select({ uuid: attachments.uuid }).from(attachments).where(inArray(attachments.id, deletableAttachmentIds));
  await tx.delete(attachments).where(inArray(attachments.id, deletableAttachmentIds));
  return attachmentRows.map(({ uuid }) => uuid);
}

async function applySubmissionPhotos(
  audit: AuditRecorder,
  submission: SubmissionRow | null,
  type: SubmissionRow["type"],
  stationId: number | null,
  resolvedLocationId: number | null,
  migratedPhotoIds: Map<number, number>,
  locationPhotoSelections: SubmissionLocationPhotoSelectionRow[],
  previousSelections: PhotoSelectionSnapshots,
): Promise<{ attachmentUuidsToDelete: string[]; photosAdded: boolean }> {
  if (!stationId || type === "delete") return { attachmentUuidsToDelete: [], photosAdded: false };
  const { tx } = audit;

  const photos =
    submission === null ? [] : await tx.query.submissionPhotos.findMany({ where: { submission_id: submission.id }, orderBy: { id: "asc" } });
  const remapPhotoId = (locationPhotoId: number) => migratedPhotoIds.get(locationPhotoId) ?? locationPhotoId;
  const locationPhotoAdditions = locationPhotoSelections
    .filter((selection) => !selection.is_removal)
    .map((selection) => ({ ...selection, location_photo_id: remapPhotoId(selection.location_photo_id) }));
  const locationPhotoRemovalIds = locationPhotoSelections
    .filter((selection) => selection.is_removal)
    .map((selection) => remapPhotoId(selection.location_photo_id));

  const stationRow =
    resolvedLocationId !== null ? null : await tx.query.stations.findFirst({ where: { id: stationId }, columns: { location_id: true } });
  const stationLocationId = resolvedLocationId ?? stationRow?.location_id ?? null;

  const uploadedMainApplied =
    submission !== null && (await applyUploadedSubmissionPhotos(audit, submission, stationId, resolvedLocationId, photos, previousSelections));
  await applyLocationPhotoSelections(audit, locationPhotoAdditions, stationId, stationLocationId, uploadedMainApplied);
  const attachmentUuidsToDelete = await applyLocationPhotoRemovals(audit, locationPhotoRemovalIds, stationId, stationLocationId);
  await logPhotoSelectionChanges(audit, previousSelections, audit.entryMetadata ?? undefined);
  return { attachmentUuidsToDelete, photosAdded: photos.length > 0 || locationPhotoAdditions.length > 0 };
}

async function lockPendingSubmission(tx: DbTx, submission: SubmissionRow, expectedUpdatedAt?: Date): Promise<void> {
  const locked = await lockSubmission(tx, submission.id);
  if (!locked) throw new ErrorResponse("NOT_FOUND");
  if (locked.status !== "pending") throw new ErrorResponse("CONFLICT", { message: "This submission has already been reviewed" });

  const lockedAt = locked.updatedAt.getTime();
  if (lockedAt !== submission.updatedAt.getTime() || (expectedUpdatedAt !== undefined && lockedAt !== expectedUpdatedAt.getTime())) {
    throw new ErrorResponse("CONFLICT", { message: "This submission was changed after you opened it" });
  }
}

async function finalizeApprovedSubmission(
  tx: DbTx,
  submission: SubmissionRow,
  reviewerId: string,
  reviewerNotes: string | null | undefined,
  stationId: number | null,
): Promise<SubmissionRow> {
  const now = new Date();
  const [updated] = await tx
    .update(submissions)
    .set({
      status: "approved",
      station_id: submission.station_id ?? stationId,
      reviewer_id: reviewerId,
      review_notes: reviewerNotes ?? submission.review_notes,
      reviewed_at: now,
      updatedAt: now,
    })
    .where(eq(submissions.id, submission.id))
    .returning();
  if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");
  if (updated.station_id === submission.station_id) return updated;

  return { ...updated, country_code: await stampSubmissionCountry(tx, submission.id) };
}

async function applyStationEditorFields(audit: AuditRecorder, stationId: number, change: SubmissionChange): Promise<string[]> {
  const { station_status: status, station_is_confirmed: isConfirmed } = change;
  const isDetached = change.location === null;
  if (status === undefined && isConfirmed === undefined && !isDetached) return [];

  const { tx } = audit;
  const current = await tx.query.stations.findFirst({ where: { id: stationId } });
  if (!current) throw new ErrorResponse("NOT_FOUND", { message: "Station not found" });

  const oldLocationId = isDetached ? current.location_id : null;
  const patch: Partial<z.infer<typeof stationInsertSchema>> = status !== undefined && status !== current.status ? stationStatusUpdate(status) : {};
  if (isConfirmed !== undefined && isConfirmed !== current.is_confirmed) patch.is_confirmed = isConfirmed;
  if (oldLocationId !== null) patch.location_id = null;
  if (Object.keys(patch).length === 0) return [];

  const [saved] = await tx
    .update(stations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(stations.id, stationId))
    .returning();
  if (!saved) throw new ErrorResponse("FAILED_TO_UPDATE", { message: "Failed to update station" });
  await audit.log({
    entity: "stations",
    op: "update",
    recordId: stationId,
    stationId,
    old: current,
    new: saved,
    metadata: audit.entryMetadata,
  });
  if (oldLocationId === null) return [];

  const [remaining] = await tx.select({ total: count() }).from(stations).where(eq(stations.location_id, oldLocationId));
  return Number(remaining?.total ?? 0) === 0 ? deleteLocationWithPhotos(audit, oldLocationId, stationId) : [];
}

function getApprovedStationStringId(
  submission: SubmissionRow,
  proposedStation: ApprovalDraft["proposedStation"],
  stationId: number | null,
  stationContext: ApprovalStationContext | null,
): string | null {
  if (submission.type === "new" && proposedStation) return proposedStation.station_id ?? null;
  if (!stationId) return null;
  if (submission.type === "update" && proposedStation?.station_id) return proposedStation.station_id;
  return stationContext?.stationStringId ?? null;
}

async function syncStatusWithCells(audit: AuditRecorder, stationId: number): Promise<boolean> {
  const { tx } = audit;
  const [previousStation, [cellCount]] = await Promise.all([
    tx.query.stations.findFirst({ where: { id: stationId } }),
    tx.select({ total: count() }).from(cells).where(eq(cells.station_id, stationId)),
  ]);
  if (!previousStation || previousStation.status === "inactive") return false;

  const nextStatus = stationStatusForCellCount(Number(cellCount?.total ?? 0));
  if (nextStatus === previousStation.status) return false;

  const [updatedStation] = await tx
    .update(stations)
    .set(stationStatusUpdate(nextStatus))
    .where(and(eq(stations.id, stationId), eq(stations.status, previousStation.status)))
    .returning();
  if (!updatedStation) return false;

  await audit.log({
    entity: "stations",
    op: "update",
    recordId: stationId,
    stationId,
    old: previousStation,
    new: updatedStation,
    metadata: audit.entryMetadata,
  });
  return true;
}

export function getDestinationStationIds(change: SubmissionChange): number[] {
  return unique((change.cells ?? []).map((cell) => cell.destination_station_id));
}

async function applyChange(
  audit: AuditRecorder,
  draft: ApprovalDraft,
  submission: SubmissionRow | null,
  change: SubmissionChange | null,
): Promise<AppliedChange> {
  const { tx } = audit;
  const { type } = draft;
  const targetCellsPromise = loadTargetCells(tx, draft.proposedCellRows);
  let stationId = draft.stationId;
  let resolvedLocationId: number | null = null;

  if (type === "new") {
    const result = await applyNewSubmission(audit, draft, change?.station_is_confirmed ?? true);
    stationId = result.stationId;
    resolvedLocationId = result.resolvedLocationId;
  }

  const submissionPhotoSelectionRows =
    submission !== null && stationId && type !== "delete"
      ? await tx.query.submissionLocationPhotoSelections.findMany({ where: { submission_id: submission.id } })
      : [];
  const previousPhotoSelections: PhotoSelectionSnapshots =
    stationId && type !== "delete" ? await loadPhotoSelectionSnapshots(tx, [stationId]) : new Map();

  let migratedPhotoIds = new Map<number, number>();
  if (type === "update" && draft.proposedLocation && stationId) {
    const { changes, move } = draft.proposedLocation;
    const locationResult = await applyUpdatedLocation(audit, changes, stationId, move);
    resolvedLocationId = locationResult.locationId;
    migratedPhotoIds = locationResult.migratedPhotoIds;
  }

  if (type === "update" && draft.proposedStation && stationId) {
    await applyStationIdentityUpdate(audit, draft.proposedStation, stationId);
    await applyExtraIdentifierUpdate(audit, draft.proposedStation, stationId);
    await applyUplinkUpdate(audit, draft.proposedStation, stationId);
  }

  if (type === "delete") await applyDeletedSubmission(audit, stationId);

  const { sectorIdByLocalId, sectorIdsToDeleteAfterCells, previousSectors } = await applyProposedSectors(tx, stationId, draft.proposedSectorRows);

  await checkProposedPciDuplicates(stationId, draft.proposedCellRows);
  const targetCellsArr = await targetCellsPromise;
  const strayCell = targetCellsArr.find((targetCell) => targetCell.station_id !== stationId);
  if (strayCell) throw new ErrorResponse("CONFLICT", { message: `Target cell ${strayCell.id} is on another station` });
  const targetCellsMap = new Map(targetCellsArr.map((targetCell) => [targetCell.id, targetCell] as const));
  const cellChanges = await applyProposedCells(tx, draft.proposedCellRows, stationId, targetCellsMap, sectorIdByLocalId, change?.cells ?? []);
  const destinationIds = change === null ? [] : getDestinationStationIds(change);
  if (destinationIds.length > 0) await tx.update(stations).set({ updatedAt: new Date() }).where(inArray(stations.id, destinationIds));

  const changesCells = cellChanges.added.length > 0 || cellChanges.deleted.length > 0 || destinationIds.length > 0;
  const statusFollowedCells = type === "update" && stationId !== null && changesCells && (await syncStatusWithCells(audit, stationId));
  await Promise.all(destinationIds.map((destinationId) => syncStatusWithCells(audit, destinationId)));

  await deleteUnretainedSectors(tx, stationId, sectorIdsToDeleteAfterCells);
  await finishSectorChange(audit, stationId, previousSectors);
  await logCellChanges(audit, cellChanges);

  if (type === "update" && stationId && !statusFollowedCells) {
    await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, stationId));
  }

  const detachedUuids = change !== null && stationId && type === "update" ? await applyStationEditorFields(audit, stationId, change) : [];
  const movesStation = draft.proposedLocation !== undefined || typeof draft.proposedStation?.operator_id === "number" || change?.location === null;
  await assertStoredCellBandsFit(tx, {
    cellIds: [...cellChanges.added, ...cellChanges.updated.map(({ id }) => id)],
    stationId: type === "update" && movesStation ? stationId : null,
  });

  const { attachmentUuidsToDelete, photosAdded } = await applySubmissionPhotos(
    audit,
    submission,
    type,
    stationId,
    resolvedLocationId,
    migratedPhotoIds,
    submissionPhotoSelectionRows,
    previousPhotoSelections,
  );

  return { stationId, attachmentUuidsToDelete: [...attachmentUuidsToDelete, ...detachedUuids], cellChanges, photosAdded };
}

async function runApprovalTransaction({
  audit,
  submission,
  reviewerId,
  reviewerNotes,
  expectedUpdatedAt,
  duplicateCheckDraft,
  stationContext,
}: {
  audit: AuditRecorder;
  submission: SubmissionRow;
  reviewerId: string;
  reviewerNotes?: string | null;
  expectedUpdatedAt?: Date;
  duplicateCheckDraft: ApprovalDuplicateCheckDraft;
  stationContext: ApprovalStationContext | null;
}): Promise<ApprovalOutcome> {
  const { tx } = audit;
  await lockPendingSubmission(tx, submission, expectedUpdatedAt);
  const draft = await loadApprovalDraft(tx, submission, duplicateCheckDraft);
  const applied = await applyChange(audit.withEntryMetadata({ submission_id: submission.id }), draft, submission, null);

  const updated = await finalizeApprovedSubmission(tx, submission, reviewerId, reviewerNotes, applied.stationId);
  await audit.log({
    entity: "submissions",
    op: "update",
    recordId: submission.id,
    stationId: applied.stationId,
    old: submission,
    new: updated,
  });

  return {
    ...applied,
    submission: updated,
    stationStringId: getApprovedStationStringId(submission, draft.proposedStation, applied.stationId, stationContext),
  };
}

function toProposedCellRow(cell: ChangeCell): ProposedCellRow {
  const details = cell.operation === "delete" ? null : ((cell.details as Record<string, unknown> | undefined) ?? null);
  return {
    operation: cell.operation ?? "add",
    target_cell_id: cell.target_cell_id ?? null,
    band_id: cell.band_id ?? null,
    target_sector_id: cell.target_sector_id ?? null,
    sector_local_id: cell.sector_local_id ?? null,
    sector_unassigned: cell.sector_unassigned ?? false,
    rat: cell.rat ?? null,
    type: cell.type ?? null,
    notes: cell.notes ?? null,
    is_confirmed: cell.is_confirmed ?? false,
    gsm: cell.rat === "GSM" ? (details as ProposedCellRow["gsm"]) : null,
    umts: cell.rat === "UMTS" ? (details as ProposedCellRow["umts"]) : null,
    lte: cell.rat === "LTE" ? (details as ProposedCellRow["lte"]) : null,
    nr: cell.rat === "NR" ? (details as ProposedCellRow["nr"]) : null,
  };
}

async function buildChangeDraft(tx: DbTx, change: SubmissionChange): Promise<ApprovalDraft> {
  const type = change.type ?? "new";
  const stationId = change.station_id ?? null;
  const location = change.location ?? undefined;
  const { stationData, locationData } =
    type === "update" && stationId !== null
      ? await stripUnchangedProposalData(tx, stationId, change.station, location)
      : { stationData: change.station, locationData: location };

  return {
    type,
    stationId,
    proposedStation: stationData,
    proposedLocation: locationData ? { changes: locationData, move: location?.move ?? "station" } : undefined,
    proposedSectorRows: (change.sectors ?? []).map(({ operation, target_sector_id, local_id, azimuth }) => ({
      operation: operation ?? null,
      target_sector_id: target_sector_id ?? null,
      local_id,
      azimuth,
    })),
    proposedCellRows: (change.cells ?? []).map(toProposedCellRow),
  };
}

export async function applyDirectChange(audit: AuditRecorder, change: SubmissionChange): Promise<AppliedChange> {
  return applyChange(audit, await buildChangeDraft(audit.tx, change), null, change);
}

export async function approveSubmissionAction({
  submissionId,
  reviewerId,
  reviewerNotes,
  expectedUpdatedAt,
  req,
}: {
  submissionId: string;
  reviewerId: string;
  reviewerNotes?: string | null;
  expectedUpdatedAt?: Date;
  req: FastifyRequest;
}) {
  const submission = await db.query.submissions.findFirst({ where: { id: submissionId } });
  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (submission.status !== "pending") throw new ErrorResponse("BAD_REQUEST", { message: "Only pending submissions can be approved" });

  const stationContext = await validatePublishedStation(submission);
  const duplicateCheckDraft = await loadApprovalDuplicateCheckDraft(submissionId);
  await checkApprovalCellDuplicates(submission, duplicateCheckDraft, stationContext);

  const transactionResult = await runAuditedOperation(
    auditContextFromRequest(req),
    {
      kind: "submission.approve",
      actorId: submission.submitter_id,
      metadata: { submission_id: submissionId, type: submission.type },
    },
    (_tx, audit) =>
      runApprovalTransaction({
        audit,
        submission,
        reviewerId,
        reviewerNotes,
        expectedUpdatedAt,
        duplicateCheckDraft,
        stationContext,
      }),
  );

  await finishApproval(submission, transactionResult, reviewerId);

  return { submission: transactionResult.submission, station_id: transactionResult.stationStringId };
}

function startChangeFollowUps(type: SubmissionRow["type"], attachmentUuidsToDelete: string[]): void {
  void deletePhotoFiles(attachmentUuidsToDelete).catch((e) =>
    logger.error("Failed to delete orphaned location photo files after approval", { error: e instanceof Error ? e.message : String(e) }),
  );

  if (type === "new") {
    void syncStationsPermitsAssociations().catch((e) =>
      logger.error("Failed to sync stations_permits after approval", { error: e instanceof Error ? e.message : String(e) }),
    );
  }
}

async function notifyStationChanges({ stationId, cellChanges, photosAdded }: AppliedChange, stationStringId: string | null): Promise<void> {
  if (!stationId) return;

  const actionStation = await db.query.stations.findFirst({
    where: { id: stationId },
    columns: { id: true, station_id: true },
    with: { location: { columns: { latitude: true, longitude: true } } },
  });
  const actionUrl = actionStation ? buildInternalStationActionUrl(actionStation) : undefined;
  const label = stationStringId ?? actionStation?.station_id ?? null;
  const addedCells = cellChanges.added.length;
  const removedCells = cellChanges.deleted.length;
  const updatedCells = cellChanges.updated.length;
  if (addedCells > 0 || removedCells > 0 || updatedCells > 0) {
    void notifyStationWatchers({
      stationId,
      stationStringId: label,
      type: "station_cells_changed",
      metadata: { added: addedCells, removed: removedCells, updated: updatedCells },
      actionUrl,
    }).catch((e) => logger.error("Failed to notify station watchers about cell changes", { error: e }));
  }
  if (photosAdded) {
    void notifyStationWatchers({
      stationId,
      stationStringId: label,
      type: "station_photos_added",
      actionUrl,
    }).catch((e) => logger.error("Failed to notify station watchers about photos", { error: e }));
  }
}

export async function finishDirectChange(type: SubmissionRow["type"], applied: AppliedChange): Promise<void> {
  startChangeFollowUps(type, applied.attachmentUuidsToDelete);
  await notifyStationChanges(applied, null);
}

async function finishApproval(submission: SubmissionRow, outcome: ApprovalOutcome, reviewerId: string): Promise<void> {
  const { submission: result, stationStringId, stationId } = outcome;
  startChangeFollowUps(submission.type, outcome.attachmentUuidsToDelete);

  const reviewer = await db.query.users.findFirst({ where: { id: reviewerId }, columns: { name: true } });
  if (submission.submitter_id !== null) {
    void createQueuedSubmissionApprovalNotification({
      userId: submission.submitter_id,
      submissionId: submission.id,
      stationId: stationId ?? undefined,
      metadata: {
        ...(stationStringId ? { station_id: stationStringId } : {}),
        ...(reviewer?.name ? { reviewer_name: reviewer.name } : {}),
        ...reviewerNoteMetadata(result.review_notes),
      },
      actionUrl: "/account/submissions",
    }).catch((e) => logger.error("Failed to send notification", { error: e }));
  }

  await notifyStationChanges(outcome, stationStringId);
}
export async function rejectSubmissionAction({
  submissionId,
  reviewerId,
  reviewerNotes,
  expectedUpdatedAt,
  req,
}: {
  submissionId: string;
  reviewerId: string;
  reviewerNotes?: string | null;
  expectedUpdatedAt?: Date;
  req: FastifyRequest;
}) {
  const submission = await db.query.submissions.findFirst({ where: { id: submissionId } });
  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (submission.status !== "pending") throw new ErrorResponse("BAD_REQUEST", { message: "Only pending submissions can be rejected" });

  const result = await runAuditedOperation(
    auditContextFromRequest(req),
    {
      metadata: { submission_id: submissionId, submitter_id: submission.submitter_id },
      kind: "submission.reject",
    },
    async (tx, audit) => {
      await lockPendingSubmission(tx, submission, expectedUpdatedAt);
      const now = new Date();
      const [updated] = await tx
        .update(submissions)
        .set({
          status: "rejected",
          reviewer_id: reviewerId,
          review_notes: reviewerNotes ?? submission.review_notes,
          reviewed_at: now,
          updatedAt: now,
        })
        .where(eq(submissions.id, submissionId))
        .returning();
      if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({
        entity: "submissions",
        op: "update",
        recordId: submissionId,
        stationId: submission.station_id,
        old: submission,
        new: updated,
      });
      return updated;
    },
  );

  const [reviewer, stationLabels] = await Promise.all([
    db.query.users.findFirst({ where: { id: reviewerId }, columns: { name: true } }),
    getSubmissionStationLabels([{ id: submissionId, station_id: submission.station_id }]),
  ]);

  if (submission.submitter_id !== null) {
    void createAndDeliverNotification({
      userId: submission.submitter_id,
      type: "submission_rejected",
      submissionId,
      stationId: submission.station_id ?? undefined,
      metadata: {
        ...stationLabelMetadata(stationLabels.get(submissionId)),
        ...(reviewer?.name ? { reviewer_name: reviewer.name } : {}),
        ...reviewerNoteMetadata(result.review_notes),
      },
      actionUrl: "/account/submissions",
    }).catch((e) => logger.error("Failed to send notification", { error: e }));
  }

  return result;
}
