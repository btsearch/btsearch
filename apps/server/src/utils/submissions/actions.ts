import {
  attachments,
  cells,
  extraIdentificators,
  locationPhotos,
  locations,
  operators,
  stationPhotoSelections,
  stationSectors,
  stations,
  submissions,
} from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { logger } from "better-auth";
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";

import { ErrorResponse } from "../../errors.ts";
import { createAuditLog } from "../../services/auditLog.service.ts";
import { checkCellDuplicatesBatch, checkLTEClidConsistency, checkPciDuplicates } from "../../services/cellDuplicateCheck.service.ts";
import {
  createAndDeliverNotification,
  createQueuedSubmissionApprovalNotification,
  notifyStationWatchers,
} from "../../services/notification.service.ts";
import { syncStationsPermitsAssociations } from "../../services/stationsPermitsAssociation.service.ts";
import type { DbTx } from "../../types/global.ts";
import { buildInternalStationActionUrl } from "../notifications/actionUrls.ts";
import {
  type NormalRat,
  type RATCellDetailsRow,
  type RATInsertDetails,
  type RATUpdateDetails,
  insertRATCellDetailsReturning,
  isNormalRat,
  updateRATCellDetailsReturning,
} from "../ratCellPersistence.ts";
import { migrateStationPhotosToLocation } from "../stationPhotos.helpers.ts";
import { stationStatusForCellCount, stationStatusUpdate } from "../stationStatus.ts";
import { normalizeText } from "../submission.helpers.ts";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

async function upsertLocation(
  tx: DbTx,
  proposedLocation: { region_id: number; city: string | null; address: string | null; longitude: number; latitude: number },
  req: FastifyRequest,
  submissionId: string,
  knownLocationAtCoords?: LocationRow | null,
): Promise<number> {
  const existingLocation =
    knownLocationAtCoords !== undefined
      ? knownLocationAtCoords
      : await tx.query.locations.findFirst({
          where: {
            AND: [{ longitude: proposedLocation.longitude }, { latitude: proposedLocation.latitude }],
          },
        });

  if (existingLocation) {
    const metadataChanged =
      existingLocation.region_id !== proposedLocation.region_id ||
      existingLocation.city !== proposedLocation.city ||
      existingLocation.address !== proposedLocation.address;

    if (metadataChanged) {
      await tx
        .update(locations)
        .set({
          region_id: proposedLocation.region_id,
          city: proposedLocation.city,
          address: proposedLocation.address,
          updatedAt: new Date(),
        })
        .where(eq(locations.id, existingLocation.id));

      await createAuditLog(
        {
          action: "locations.update",
          table_name: "locations",
          record_id: existingLocation.id,
          old_values: { region_id: existingLocation.region_id, city: existingLocation.city, address: existingLocation.address },
          new_values: { region_id: proposedLocation.region_id, city: proposedLocation.city, address: proposedLocation.address },
          metadata: { submission_id: submissionId },
        },
        req,
        tx,
      );
    }
    return existingLocation.id;
  }

  const [newLocation] = await tx
    .insert(locations)
    .values({
      region_id: proposedLocation.region_id,
      city: proposedLocation.city,
      address: proposedLocation.address,
      longitude: proposedLocation.longitude,
      latitude: proposedLocation.latitude,
    })
    .returning();
  if (!newLocation) throw new ErrorResponse("FAILED_TO_CREATE", { message: "Failed to create location" });
  await createAuditLog(
    {
      action: "locations.create",
      table_name: "locations",
      record_id: newLocation.id,
      new_values: newLocation,
      metadata: { submission_id: submissionId },
    },
    req,
    tx,
  );
  return newLocation.id;
}

type ProposedSectorRow = {
  target_sector_id: number | null;
  local_id: string;
  azimuth: number;
};

type ProposedCellSectorRef = {
  target_sector_id: number | null;
  sector_local_id: string | null;
  sector_unassigned?: boolean;
};

type ApprovalQueryClient = Pick<DbTx, "query">;
type SubmissionRow = NonNullable<Awaited<ReturnType<typeof db.query.submissions.findFirst>>>;
type LocationRow = NonNullable<Awaited<ReturnType<DbTx["query"]["locations"]["findFirst"]>>>;
type ApprovalDraft = {
  proposedStation: Awaited<ReturnType<typeof loadProposedStationForApproval>>;
  proposedLocation: Awaited<ReturnType<DbTx["query"]["proposedLocations"]["findFirst"]>>;
  proposedSectorRows: Awaited<ReturnType<DbTx["query"]["proposedSectors"]["findMany"]>>;
  proposedCellRows: Awaited<ReturnType<typeof loadProposedCellsForApproval>>;
};
type ProposedCellRow = ApprovalDraft["proposedCellRows"][number];
type TargetCellRow = NonNullable<Awaited<ReturnType<typeof loadTargetCells>>[number]>;
type SubmissionPhotoRow = Awaited<ReturnType<DbTx["query"]["submissionPhotos"]["findMany"]>>[number];
type SubmissionLocationPhotoSelectionRow = Awaited<ReturnType<DbTx["query"]["submissionLocationPhotoSelections"]["findMany"]>>[number];
type ApprovalDuplicateCheckDraft = Pick<ApprovalDraft, "proposedStation" | "proposedCellRows">;
type ApprovalStationContext = { operatorId: number | null; stationStringId: string | null };
type CellAuditChanges = {
  added: Array<Record<string, unknown>>;
  updated: Array<{ old: Record<string, unknown>; new: Record<string, unknown> }>;
  deleted: Array<Record<string, unknown>>;
};

function resolveProposedCellSectorId(proposed: ProposedCellSectorRef, sectorIdByLocalId: ReadonlyMap<string, number>): number | null | undefined {
  if (proposed.target_sector_id !== null && proposed.target_sector_id !== undefined) return proposed.target_sector_id;
  if (proposed.sector_local_id) return sectorIdByLocalId.get(proposed.sector_local_id) ?? null;
  if (proposed.sector_unassigned) return null;
  return undefined;
}

function getSiblingMnc(mnc: number | null | undefined): number | null {
  const TMOBILE_MNC = 26002;
  const ORANGE_MNC = 26003;

  if (mnc === TMOBILE_MNC) return ORANGE_MNC;
  if (mnc === ORANGE_MNC) return TMOBILE_MNC;
  return null;
}

function getProposedCellDetails(proposed: ProposedCellRow): Record<string, unknown> | null {
  return (proposed.lte ?? proposed.gsm ?? proposed.umts ?? proposed.nr) as Record<string, unknown> | null;
}

function getTargetCellDetails(targetCell: TargetCellRow): Record<string, unknown> | null {
  return (targetCell.gsm ?? targetCell.umts ?? targetCell.lte ?? targetCell.nr) as Record<string, unknown> | null;
}

async function validatePublishedStation(submission: SubmissionRow): Promise<ApprovalStationContext | null> {
  if (submission.station_id === null) return null;

  const station = await db.query.stations.findFirst({
    where: { id: submission.station_id },
    columns: { status: true, operator_id: true, station_id: true },
  });
  if (!station || (station.status !== "published" && station.status !== "pending"))
    throw new ErrorResponse("NOT_FOUND", { message: "Station not found for the provided station_id" });
  return { operatorId: station.operator_id, stationStringId: station.station_id ?? null };
}

async function loadProposedStationForApproval(client: ApprovalQueryClient, submissionId: string) {
  return client.query.proposedStations.findFirst({ where: { submission_id: submissionId } });
}

async function loadProposedCellsForApproval(client: ApprovalQueryClient, submissionId: string) {
  return client.query.proposedCells.findMany({ where: { submission_id: submissionId }, with: { gsm: true, umts: true, lte: true, nr: true } });
}

async function loadApprovalDraft(tx: DbTx, submissionId: string, preloaded?: ApprovalDuplicateCheckDraft) {
  const [proposedStation, proposedLocation, proposedSectorRows, proposedCellRows] = await Promise.all([
    preloaded ? Promise.resolve(preloaded.proposedStation) : loadProposedStationForApproval(tx, submissionId),
    tx.query.proposedLocations.findFirst({ where: { submission_id: submissionId } }),
    tx.query.proposedSectors.findMany({ where: { submission_id: submissionId }, orderBy: { id: "asc" } }),
    preloaded ? Promise.resolve(preloaded.proposedCellRows) : loadProposedCellsForApproval(tx, submissionId),
  ]);

  return { proposedStation, proposedLocation, proposedSectorRows, proposedCellRows };
}

async function loadApprovalDuplicateCheckDraft(submissionId: string): Promise<ApprovalDuplicateCheckDraft> {
  const [proposedStation, proposedCellRows] = await Promise.all([
    loadProposedStationForApproval(db, submissionId),
    loadProposedCellsForApproval(db, submissionId),
  ]);

  return { proposedStation, proposedCellRows };
}

async function createExtraIdentifierForNewStation(
  tx: DbTx,
  proposedStation: NonNullable<ApprovalDraft["proposedStation"]>,
  stationId: number,
  submissionId: string,
  req: FastifyRequest,
): Promise<void> {
  if (!proposedStation.networks_id && !proposedStation.mno_name) return;

  const [newIdentifier] = await tx
    .insert(extraIdentificators)
    .values({
      station_id: stationId,
      networks_id: proposedStation.networks_id ?? null,
      networks_name: proposedStation.networks_name ?? null,
      mno_name: proposedStation.mno_name ?? null,
    })
    .returning();

  if (!newIdentifier) return;

  await createAuditLog(
    {
      action: "stations.update",
      table_name: "extra_identificators",
      record_id: stationId,
      old_values: null,
      new_values: newIdentifier,
      metadata: { submission_id: submissionId },
    },
    req,
    tx,
  );
}

async function createStationFromProposal(
  tx: DbTx,
  proposedStation: NonNullable<ApprovalDraft["proposedStation"]>,
  locationId: number | null,
  submissionId: string,
  req: FastifyRequest,
  proposedCellCount: number,
): Promise<number> {
  const [newStation] = await tx
    .insert(stations)
    .values({
      station_id: proposedStation.station_id ?? "",
      location_id: locationId,
      operator_id: proposedStation.operator_id,
      notes: typeof proposedStation.notes === "string" && proposedStation.notes.trim() !== "" ? proposedStation.notes : null,
      is_confirmed: true,
      status: stationStatusForCellCount(proposedCellCount),
      statusChangedAt: new Date(),
    })
    .returning();
  if (!newStation) throw new ErrorResponse("FAILED_TO_CREATE", { message: "Failed to create station" });

  await createAuditLog(
    {
      action: "stations.create",
      table_name: "stations",
      record_id: newStation.id,
      new_values: newStation,
      metadata: { submission_id: submissionId },
    },
    req,
    tx,
  );

  await createExtraIdentifierForNewStation(tx, proposedStation, newStation.id, submissionId, req);
  return newStation.id;
}

async function applyNewSubmission(
  tx: DbTx,
  draft: ApprovalDraft,
  submissionId: string,
  req: FastifyRequest,
): Promise<{ stationId: number | null; resolvedLocationId: number | null }> {
  let locationId: number | null = null;

  if (draft.proposedLocation) locationId = await upsertLocation(tx, draft.proposedLocation, req, submissionId);

  let stationId: number | null = null;
  if (draft.proposedStation)
    stationId = await createStationFromProposal(tx, draft.proposedStation, locationId, submissionId, req, draft.proposedCellRows.length);

  return { stationId, resolvedLocationId: locationId };
}

async function deleteEmptiedLocation(tx: DbTx, currentLocation: LocationRow, submissionId: string, req: FastifyRequest): Promise<void> {
  await tx.delete(locations).where(eq(locations.id, currentLocation.id));
  await createAuditLog(
    {
      action: "locations.delete",
      table_name: "locations",
      record_id: currentLocation.id,
      old_values: { longitude: currentLocation.longitude, latitude: currentLocation.latitude },
      metadata: { submission_id: submissionId },
    },
    req,
    tx,
  );
}

async function updateStationLocation(tx: DbTx, stationId: number, locationId: number, submissionId: string, req: FastifyRequest): Promise<void> {
  await tx.update(stations).set({ location_id: locationId, updatedAt: new Date() }).where(eq(stations.id, stationId));
  await createAuditLog(
    {
      action: "stations.update",
      table_name: "stations",
      record_id: stationId,
      new_values: { location_id: locationId },
      metadata: { submission_id: submissionId },
    },
    req,
    tx,
  );
}

async function updateLocationMetadata(
  tx: DbTx,
  currentLocation: LocationRow,
  proposedLocation: NonNullable<ApprovalDraft["proposedLocation"]>,
  submissionId: string,
  req: FastifyRequest,
): Promise<void> {
  const metadataChanged =
    currentLocation.region_id !== proposedLocation.region_id ||
    currentLocation.city !== proposedLocation.city ||
    currentLocation.address !== proposedLocation.address;

  if (!metadataChanged) return;

  await tx
    .update(locations)
    .set({ region_id: proposedLocation.region_id, city: proposedLocation.city, address: proposedLocation.address, updatedAt: new Date() })
    .where(eq(locations.id, currentLocation.id));
  await createAuditLog(
    {
      action: "locations.update",
      table_name: "locations",
      record_id: currentLocation.id,
      old_values: { region_id: currentLocation.region_id, city: currentLocation.city, address: currentLocation.address },
      new_values: { region_id: proposedLocation.region_id, city: proposedLocation.city, address: proposedLocation.address },
      metadata: { submission_id: submissionId },
    },
    req,
    tx,
  );
}

type UpdatedLocationResult = { locationId: number; migratedPhotoIds: Map<number, number> };

async function applyUpdatedLocation(
  tx: DbTx,
  proposedLocation: NonNullable<ApprovalDraft["proposedLocation"]>,
  stationId: number,
  submissionId: string,
  req: FastifyRequest,
): Promise<UpdatedLocationResult> {
  const currentStation = await tx.query.stations.findFirst({
    where: { id: stationId },
    with: { location: true },
  });

  const currentLocation = currentStation?.location ?? null;
  const coordsUnchanged =
    currentLocation && currentLocation.longitude === proposedLocation.longitude && currentLocation.latitude === proposedLocation.latitude;

  if (coordsUnchanged) {
    await updateLocationMetadata(tx, currentLocation, proposedLocation, submissionId, req);
    return { locationId: currentLocation.id, migratedPhotoIds: new Map() };
  }

  const locationAtNewCoords = await tx.query.locations.findFirst({
    where: { AND: [{ longitude: proposedLocation.longitude }, { latitude: proposedLocation.latitude }] },
  });

  const locationId = await upsertLocation(tx, proposedLocation, req, submissionId, locationAtNewCoords ?? null);
  await updateStationLocation(tx, stationId, locationId, submissionId, req);
  if (!currentLocation) return { locationId, migratedPhotoIds: new Map() };

  const [remainingResult] = await tx.select({ remaining: count() }).from(stations).where(eq(stations.location_id, currentLocation.id));
  const oldLocationOrphaned = Number(remainingResult?.remaining ?? 0) === 0;

  const migratedPhotoIds = await migrateStationPhotosToLocation(tx, stationId, currentLocation.id, locationId, oldLocationOrphaned);
  if (oldLocationOrphaned) await deleteEmptiedLocation(tx, currentLocation, submissionId, req);

  return { locationId, migratedPhotoIds };
}

async function applyStationIdentityUpdate(
  tx: DbTx,
  proposedStation: NonNullable<ApprovalDraft["proposedStation"]>,
  stationId: number,
  submissionId: string,
  req: FastifyRequest,
): Promise<void> {
  const currentStation = await tx.query.stations.findFirst({
    where: { id: stationId },
    columns: { station_id: true, operator_id: true, notes: true },
  });
  if (!currentStation) return;

  const proposedNotes = normalizeText(proposedStation.notes);
  const nextStationStringId =
    proposedStation.station_id !== null && proposedStation.station_id !== currentStation.station_id ? proposedStation.station_id : undefined;
  const nextOperatorId =
    proposedStation.operator_id !== null && proposedStation.operator_id !== currentStation.operator_id ? proposedStation.operator_id : undefined;
  const nextNotes = proposedNotes !== null && proposedNotes !== normalizeText(currentStation.notes) ? proposedNotes : undefined;

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

  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  const updateValues: Partial<typeof stations.$inferInsert> = { updatedAt: new Date() };
  if (nextStationStringId !== undefined) {
    updateValues.station_id = nextStationStringId;
    oldValues.station_id = currentStation.station_id;
    newValues.station_id = nextStationStringId;
  }
  if (nextOperatorId !== undefined) {
    updateValues.operator_id = nextOperatorId;
    oldValues.operator_id = currentStation.operator_id;
    newValues.operator_id = nextOperatorId;
  }
  if (nextNotes !== undefined) {
    updateValues.notes = nextNotes;
    oldValues.notes = currentStation.notes;
    newValues.notes = nextNotes;
  }

  await tx.update(stations).set(updateValues).where(eq(stations.id, stationId));
  await createAuditLog(
    {
      action: "stations.update",
      table_name: "stations",
      record_id: stationId,
      old_values: oldValues,
      new_values: newValues,
      metadata: { submission_id: submissionId },
    },
    req,
    tx,
  );
}

async function applyExtraIdentifierUpdate(
  tx: DbTx,
  proposedStation: NonNullable<ApprovalDraft["proposedStation"]>,
  stationId: number,
  submissionId: string,
  req: FastifyRequest,
): Promise<void> {
  const existingIdentifier = await tx.query.extraIdentificators.findFirst({ where: { station_id: stationId } });
  const proposedNetworksId = proposedStation.networks_id ?? null;
  const proposedNetworksName = normalizeText(proposedStation.networks_name);
  const proposedMnoName = normalizeText(proposedStation.mno_name);

  if (proposedNetworksId === null && proposedNetworksName === null && proposedMnoName === null) {
    if (!existingIdentifier) return;
    await tx.delete(extraIdentificators).where(eq(extraIdentificators.id, existingIdentifier.id));
    await createAuditLog(
      {
        action: "stations.update",
        table_name: "extra_identificators",
        record_id: stationId,
        old_values: existingIdentifier,
        new_values: null,
        metadata: { submission_id: submissionId },
      },
      req,
      tx,
    );
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

  await createAuditLog(
    {
      action: "stations.update",
      table_name: "extra_identificators",
      record_id: stationId,
      old_values: existingIdentifier ?? null,
      new_values: updatedIdentifier,
      metadata: { submission_id: submissionId },
    },
    req,
    tx,
  );
}

async function applyDeletedSubmission(tx: DbTx, stationId: number | null, submissionId: string, req: FastifyRequest): Promise<void> {
  if (!stationId) throw new ErrorResponse("BAD_REQUEST", { message: "Cannot delete without a station" });

  await tx.update(stations).set(stationStatusUpdate("inactive")).where(eq(stations.id, stationId));
  await createAuditLog(
    {
      action: "stations.update",
      table_name: "stations",
      record_id: stationId,
      new_values: { status: "inactive" },
      metadata: { submission_id: submissionId },
    },
    req,
    tx,
  );
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
  const allModifiedCellIds = draft.proposedCellRows.map((cell) => cell.target_cell_id).filter((id): id is number => id !== null && id !== undefined);
  const operatorId = getApprovalOperatorId(submission, draft.proposedStation, stationContext);

  // await checkLTEClidConsistency(submission.station_id ?? null, duplicateEntries, allModifiedCellIds, operatorId);

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
  previousSectors: Array<{ id: number; azimuth: number }>;
  nextSectors: Array<{ id: number; azimuth: number }>;
}> {
  const sectorIdByLocalId = new Map<string, number>();
  if (!stationId || proposedSectorRows.length === 0)
    return { sectorIdByLocalId, sectorIdsToDeleteAfterCells: [], previousSectors: [], nextSectors: [] };

  const previousSectors = await tx.query.stationSectors.findMany({
    where: { station_id: stationId },
    columns: { id: true, azimuth: true },
    orderBy: { id: "asc" },
  });
  const previousById = new Map(previousSectors.map((sector) => [sector.id, sector]));
  const retainedSectorIds = new Set<number>();
  const nextSectors: Array<{ id: number; azimuth: number }> = [];
  const proposedAzimuths = new Set<number>();
  const writeTasks: Array<() => Promise<void>> = [];

  for (const proposed of proposedSectorRows as ProposedSectorRow[]) {
    if (proposedAzimuths.has(proposed.azimuth)) throw new ErrorResponse("BAD_REQUEST", { message: "Azimuth values must be unique" });
    proposedAzimuths.add(proposed.azimuth);

    const matchingPrevious =
      proposed.target_sector_id !== null
        ? previousById.get(proposed.target_sector_id)
        : previousSectors.find((sector) => sector.azimuth === proposed.azimuth && !retainedSectorIds.has(sector.id));

    if (matchingPrevious) {
      retainedSectorIds.add(matchingPrevious.id);
      sectorIdByLocalId.set(proposed.local_id, matchingPrevious.id);
      nextSectors.push({ id: matchingPrevious.id, azimuth: proposed.azimuth });
      if (matchingPrevious.azimuth !== proposed.azimuth)
        writeTasks.push(async () => {
          await tx
            .update(stationSectors)
            .set({ azimuth: proposed.azimuth })
            .where(and(eq(stationSectors.id, matchingPrevious.id), eq(stationSectors.station_id, stationId)));
        });
      continue;
    }

    writeTasks.push(async () => {
      const [insertedSector] = await tx
        .insert(stationSectors)
        .values({ station_id: stationId, azimuth: proposed.azimuth })
        .returning({ id: stationSectors.id });
      if (!insertedSector) throw new ErrorResponse("FAILED_TO_CREATE", { message: "Failed to create station azimuth" });
      sectorIdByLocalId.set(proposed.local_id, insertedSector.id);
      nextSectors.push({ id: insertedSector.id, azimuth: proposed.azimuth });
    });
  }

  await writeTasks.reduce((previous, writeTask) => previous.then(writeTask), Promise.resolve());

  const sectorIdsToDeleteAfterCells = previousSectors.filter((sector) => !retainedSectorIds.has(sector.id)).map((sector) => sector.id);
  return { sectorIdByLocalId, sectorIdsToDeleteAfterCells, previousSectors, nextSectors: nextSectors.sort((a, b) => a.id - b.id) };
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

async function insertCellDetails(tx: DbTx, proposed: ProposedCellRow, cellId: number): Promise<RATCellDetailsRow | null> {
  if (!proposed.rat || !isNormalRat(proposed.rat)) return null;

  const details = getProposedRATDetails(proposed, proposed.rat);
  if (!details) return null;

  return insertRATCellDetailsReturning(tx, proposed.rat, cellId, details as RATInsertDetails);
}

async function updateCellDetails(tx: DbTx, proposed: ProposedCellRow, targetCell: TargetCellRow): Promise<RATCellDetailsRow | null> {
  const rat = proposed.rat ?? targetCell.rat;
  if (!isNormalRat(rat)) return null;

  const details = getProposedRATDetails(proposed, rat);
  if (!details) return null;

  return updateRATCellDetailsReturning(tx, rat, targetCell.id, details as RATUpdateDetails);
}

async function addProposedCell(
  tx: DbTx,
  proposed: ProposedCellRow,
  stationId: number | null,
  sectorIdByLocalId: ReadonlyMap<string, number>,
): Promise<Record<string, unknown>> {
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
      notes: proposed.notes,
      is_confirmed: proposed.is_confirmed,
    })
    .returning();
  if (!newCell) throw new ErrorResponse("FAILED_TO_CREATE", { message: "Failed to create cell" });

  const details = await insertCellDetails(tx, proposed, newCell.id);
  return { ...newCell, details };
}

async function updateProposedCell(
  tx: DbTx,
  proposed: ProposedCellRow,
  targetCellsMap: ReadonlyMap<number, TargetCellRow>,
  sectorIdByLocalId: ReadonlyMap<string, number>,
): Promise<{ old: Record<string, unknown>; new: Record<string, unknown> }> {
  const targetCellId = proposed.target_cell_id;
  if (!targetCellId) throw new ErrorResponse("BAD_REQUEST", { message: "Cannot update cell without target_cell_id" });

  const targetCell = targetCellsMap.get(targetCellId);
  if (!targetCell) throw new ErrorResponse("NOT_FOUND", { message: `Target cell ${targetCellId} not found` });

  const cellUpdate: Record<string, unknown> = { updatedAt: new Date() };
  if (proposed.band_id) cellUpdate.band_id = proposed.band_id;
  if (proposed.rat) cellUpdate.rat = proposed.rat;
  if (proposed.notes !== null) cellUpdate.notes = proposed.notes;
  const sectorId = resolveProposedCellSectorId(proposed, sectorIdByLocalId);
  if (sectorId !== undefined) cellUpdate.sector_id = sectorId;

  await tx.update(cells).set(cellUpdate).where(eq(cells.id, targetCellId));

  const newDetails = await updateCellDetails(tx, proposed, targetCell);
  const { gsm: _gsm, umts: _umts, lte: _lte, nr: _nr, ...baseCellOld } = targetCell;
  const oldDetails = getTargetCellDetails(targetCell);

  return { old: { ...baseCellOld, details: oldDetails }, new: { ...baseCellOld, ...cellUpdate, details: newDetails } };
}

async function deleteProposedCell(
  tx: DbTx,
  proposed: ProposedCellRow,
  targetCellsMap: ReadonlyMap<number, TargetCellRow>,
): Promise<Record<string, unknown>> {
  const targetCellId = proposed.target_cell_id;
  if (!targetCellId) throw new ErrorResponse("BAD_REQUEST", { message: "Cannot delete cell without target_cell_id" });

  const targetCell = targetCellsMap.get(targetCellId);
  if (!targetCell) throw new ErrorResponse("NOT_FOUND", { message: `Target cell ${targetCellId} not found` });

  await tx.delete(cells).where(eq(cells.id, targetCellId));
  const { gsm: _dGsm, umts: _dUmts, lte: _dLte, nr: _dNr, ...baseCellDelete } = targetCell;
  return { ...baseCellDelete, details: getTargetCellDetails(targetCell) };
}

async function applyProposedCells(
  tx: DbTx,
  proposedCellRows: ProposedCellRow[],
  stationId: number | null,
  targetCellsMap: ReadonlyMap<number, TargetCellRow>,
  sectorIdByLocalId: ReadonlyMap<string, number>,
): Promise<CellAuditChanges> {
  const changes: CellAuditChanges = { added: [], updated: [], deleted: [] };
  const writeTasks: Array<() => Promise<void>> = [];

  for (const proposed of proposedCellRows) {
    switch (proposed.operation) {
      case "add":
        writeTasks.push(() =>
          addProposedCell(tx, proposed, stationId, sectorIdByLocalId).then((added) => {
            changes.added.push(added);
          }),
        );
        break;
      case "update":
        writeTasks.push(() =>
          updateProposedCell(tx, proposed, targetCellsMap, sectorIdByLocalId).then((updated) => {
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
    throw new ErrorResponse("BAD_REQUEST", { message: "Cannot delete azimuths that are still assigned to cells" });
  await tx.delete(stationSectors).where(inArray(stationSectors.id, sectorIdsToDelete));
}

async function createSectorAuditLog(
  tx: DbTx,
  stationId: number | null,
  proposedSectorRows: ApprovalDraft["proposedSectorRows"],
  previousSectors: Array<{ id: number; azimuth: number }>,
  nextSectors: Array<{ id: number; azimuth: number }>,
  submissionId: string,
  req: FastifyRequest,
): Promise<void> {
  if (!stationId || proposedSectorRows.length === 0) return;

  await createAuditLog(
    {
      action: "stations.update",
      table_name: "station_sectors",
      record_id: stationId,
      old_values: previousSectors,
      new_values: nextSectors,
      metadata: { submission_id: submissionId, station_id: stationId },
    },
    req,
    tx,
  );
}

async function createCellAuditLogs(
  tx: DbTx,
  changes: CellAuditChanges,
  stationId: number | null,
  submissionId: string,
  req: FastifyRequest,
): Promise<void> {
  if (changes.added.length > 0)
    await createAuditLog(
      {
        action: "cells.create",
        table_name: "cells",
        record_id: null,
        new_values: { cells: changes.added },
        metadata: { submission_id: submissionId, station_id: stationId },
      },
      req,
      tx,
    );
  if (changes.updated.length > 0)
    await createAuditLog(
      {
        action: "cells.update",
        table_name: "cells",
        record_id: null,
        old_values: { cells: changes.updated.map((cell) => cell.old) },
        new_values: { cells: changes.updated.map((cell) => cell.new) },
        metadata: { submission_id: submissionId },
      },
      req,
      tx,
    );
  if (changes.deleted.length > 0)
    await createAuditLog(
      {
        action: "cells.delete",
        table_name: "cells",
        record_id: null,
        old_values: { cells: changes.deleted },
        metadata: { submission_id: submissionId },
      },
      req,
      tx,
    );
}

async function loadStationPhotoContext(tx: DbTx, stationId: number): Promise<{ locationId: number | null; mnc: number | null } | null> {
  const [stationPhotoContext] = await tx
    .select({ locationId: stations.location_id, mnc: operators.mnc })
    .from(stations)
    .leftJoin(operators, eq(stations.operator_id, operators.id))
    .where(eq(stations.id, stationId))
    .limit(1);
  return stationPhotoContext ?? null;
}

async function applyUploadedSubmissionPhotos(
  tx: DbTx,
  submission: SubmissionRow,
  submissionId: string,
  stationId: number,
  resolvedLocationId: number | null,
  photos: SubmissionPhotoRow[],
): Promise<boolean> {
  if (photos.length === 0) return false;

  let stationPhotoContext: Awaited<ReturnType<typeof loadStationPhotoContext>> = null;
  let photoLocationId = resolvedLocationId;
  if (!photoLocationId) {
    stationPhotoContext = await loadStationPhotoContext(tx, stationId);
    photoLocationId = stationPhotoContext?.locationId ?? null;
  }
  if (!photoLocationId) return false;

  await tx
    .insert(locationPhotos)
    .values(
      photos.map((photo) => ({
        location_id: photoLocationId,
        attachment_id: photo.attachment_id,
        submission_id: submissionId,
        uploaded_by: submission.submitter_id,
        note: photo.note,
        taken_at: photo.taken_at,
      })),
    )
    .onConflictDoNothing();

  const unorderedRows = await tx
    .select({ id: locationPhotos.id, attachment_id: locationPhotos.attachment_id })
    .from(locationPhotos)
    .where(
      and(
        eq(locationPhotos.location_id, photoLocationId),
        inArray(
          locationPhotos.attachment_id,
          photos.map((photo) => photo.attachment_id),
        ),
      ),
    );

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
    stationPhotoContext ? Promise.resolve(stationPhotoContext) : loadStationPhotoContext(tx, stationId),
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

  const siblingMnc = getSiblingMnc(loadedStationPhotoContext?.mnc);
  if (siblingMnc === null) return explicitMainId !== null;

  const [siblingStation] = await tx
    .select({ id: stations.id })
    .from(stations)
    .innerJoin(operators, eq(stations.operator_id, operators.id))
    .where(and(eq(stations.location_id, photoLocationId), eq(operators.mnc, siblingMnc)));

  if (!siblingStation) return explicitMainId !== null;

  const siblingExistingMain = await tx.query.stationPhotoSelections.findFirst({
    where: { station_id: siblingStation.id, is_main: true },
  });
  await tx
    .insert(stationPhotoSelections)
    .values(
      locationPhotoRows.map((locationPhoto, index) => ({
        station_id: siblingStation.id,
        location_photo_id: locationPhoto.id,
        is_main: resolveIsMain(locationPhoto.id, index, !!siblingExistingMain),
      })),
    )
    .onConflictDoNothing();

  if (explicitMainId !== null) await forceMainSelection(tx, siblingStation.id, explicitMainId);

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
  tx: DbTx,
  locationPhotoSels: SubmissionLocationPhotoSelectionRow[],
  stationLocationId: number,
): Promise<SubmissionLocationPhotoSelectionRow[]> {
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
        .returning({ id: locationPhotos.id });
      targetId = copy?.id;
    }
    if (targetId === undefined || resolvedIds.has(targetId)) continue;
    resolvedIds.add(targetId);
    resolvedSels.push({ ...selection, location_photo_id: targetId });
  }
  /* eslint-enable no-await-in-loop */
  return resolvedSels;
}

async function applyLocationPhotoSelections(
  tx: DbTx,
  locationPhotoSels: SubmissionLocationPhotoSelectionRow[],
  stationId: number,
  stationLocationId: number | null,
  uploadedMainApplied: boolean,
): Promise<void> {
  if (locationPhotoSels.length === 0 || stationLocationId === null) return;

  const resolvedSels = await resolvePhotoSelectionsToLocation(tx, locationPhotoSels, stationLocationId);
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

async function deleteAttachmentFiles(attachmentUuids: string[]): Promise<void> {
  if (attachmentUuids.length === 0) return;
  await Promise.all(attachmentUuids.map((uuid) => fs.unlink(path.join(UPLOAD_DIR, `${uuid}.webp`)).catch(() => {})));
}

async function applyLocationPhotoRemovals(
  tx: DbTx,
  removalPhotoIds: number[],
  stationId: number,
  stationLocationId: number | null,
): Promise<string[]> {
  if (removalPhotoIds.length === 0) return [];

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
    .select({ id: locationPhotos.id, attachmentId: locationPhotos.attachment_id })
    .from(locationPhotos)
    .leftJoin(stationPhotoSelections, eq(stationPhotoSelections.location_photo_id, locationPhotos.id))
    .where(and(inArray(locationPhotos.id, removalPhotoIds), eq(locationPhotos.location_id, stationLocationId), isNull(stationPhotoSelections.id)));

  if (orphanedPhotos.length === 0) return [];

  const orphanIds = orphanedPhotos.map((photo) => photo.id);
  const orphanAttachmentIds = orphanedPhotos.map((photo) => photo.attachmentId);

  await tx.delete(locationPhotos).where(inArray(locationPhotos.id, orphanIds));

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
  tx: DbTx,
  submission: SubmissionRow,
  submissionId: string,
  stationId: number | null,
  resolvedLocationId: number | null,
  migratedPhotoIds: Map<number, number>,
  locationPhotoSelections: SubmissionLocationPhotoSelectionRow[],
): Promise<{ attachmentUuidsToDelete: string[]; photosAdded: boolean }> {
  if (!stationId || submission.type === "delete") return { attachmentUuidsToDelete: [], photosAdded: false };

  const photos = await tx.query.submissionPhotos.findMany({ where: { submission_id: submissionId }, orderBy: { id: "asc" } });
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

  const uploadedMainApplied = await applyUploadedSubmissionPhotos(tx, submission, submissionId, stationId, resolvedLocationId, photos);
  await applyLocationPhotoSelections(tx, locationPhotoAdditions, stationId, stationLocationId, uploadedMainApplied);
  const attachmentUuidsToDelete = await applyLocationPhotoRemovals(tx, locationPhotoRemovalIds, stationId, stationLocationId);
  return { attachmentUuidsToDelete, photosAdded: photos.length > 0 || locationPhotoAdditions.length > 0 };
}

async function finalizeApprovedSubmission(
  tx: DbTx,
  submission: SubmissionRow,
  submissionId: string,
  reviewerId: string,
  reviewerNotes: string | null | undefined,
): Promise<SubmissionRow> {
  const now = new Date();
  const [updated] = await tx
    .update(submissions)
    .set({
      status: "approved",
      reviewer_id: reviewerId,
      review_notes: reviewerNotes ?? submission.review_notes,
      reviewed_at: now,
      updatedAt: now,
    })
    .where(eq(submissions.id, submissionId))
    .returning();
  if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");
  return updated;
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

async function runApprovalTransaction({
  tx,
  submission,
  submissionId,
  reviewerId,
  reviewerNotes,
  req,
  duplicateCheckDraft,
  stationContext,
}: {
  tx: DbTx;
  submission: SubmissionRow;
  submissionId: string;
  reviewerId: string;
  reviewerNotes?: string | null;
  req: FastifyRequest;
  duplicateCheckDraft: ApprovalDuplicateCheckDraft;
  stationContext: ApprovalStationContext | null;
}): Promise<{
  submission: SubmissionRow;
  resolvedStationId: number | null;
  stationStringId: string | null;
  attachmentUuidsToDelete: string[];
  cellChanges: CellAuditChanges;
  photosAdded: boolean;
}> {
  const draft = await loadApprovalDraft(tx, submissionId, duplicateCheckDraft);
  const targetCellsPromise = loadTargetCells(tx, draft.proposedCellRows);
  let stationId = submission.station_id;
  let resolvedLocationId: number | null = null;

  if (submission.type === "new") {
    const result = await applyNewSubmission(tx, draft, submissionId, req);
    stationId = result.stationId;
    resolvedLocationId = result.resolvedLocationId;
  }

  const submissionPhotoSelectionRows =
    stationId && submission.type !== "delete"
      ? await tx.query.submissionLocationPhotoSelections.findMany({ where: { submission_id: submissionId } })
      : [];

  let migratedPhotoIds = new Map<number, number>();
  if (submission.type === "update" && draft.proposedLocation && stationId) {
    const locationResult = await applyUpdatedLocation(tx, draft.proposedLocation, stationId, submissionId, req);
    resolvedLocationId = locationResult.locationId;
    migratedPhotoIds = locationResult.migratedPhotoIds;
  }

  if (submission.type === "update" && draft.proposedStation && stationId) {
    await applyStationIdentityUpdate(tx, draft.proposedStation, stationId, submissionId, req);
    await applyExtraIdentifierUpdate(tx, draft.proposedStation, stationId, submissionId, req);
  }

  if (submission.type === "delete") await applyDeletedSubmission(tx, stationId, submissionId, req);

  const { sectorIdByLocalId, sectorIdsToDeleteAfterCells, previousSectors, nextSectors } = await applyProposedSectors(
    tx,
    stationId,
    draft.proposedSectorRows,
  );

  await checkProposedPciDuplicates(stationId, draft.proposedCellRows);
  const targetCellsArr = await targetCellsPromise;
  const targetCellsMap = new Map(targetCellsArr.map((targetCell) => [targetCell.id, targetCell] as const));
  const cellChanges = await applyProposedCells(tx, draft.proposedCellRows, stationId, targetCellsMap, sectorIdByLocalId);

  let publishedPendingStation = false;
  if (submission.type === "update" && stationId && cellChanges.added.length > 0) {
    const [updatedStation] = await tx
      .update(stations)
      .set(stationStatusUpdate("published"))
      .where(and(eq(stations.id, stationId), eq(stations.status, "pending")))
      .returning({ id: stations.id });
    publishedPendingStation = updatedStation !== undefined;

    if (updatedStation)
      await createAuditLog(
        {
          action: "stations.update",
          table_name: "stations",
          record_id: stationId,
          old_values: { status: "pending" },
          new_values: { status: "published" },
          metadata: { submission_id: submissionId },
        },
        req,
        tx,
      );
  }

  await deleteUnretainedSectors(tx, stationId, sectorIdsToDeleteAfterCells);
  await createSectorAuditLog(tx, stationId, draft.proposedSectorRows, previousSectors, nextSectors, submissionId, req);
  await createCellAuditLogs(tx, cellChanges, stationId, submissionId, req);

  if (submission.type === "update" && stationId && !publishedPendingStation)
    await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, stationId));

  const { attachmentUuidsToDelete, photosAdded } = await applySubmissionPhotos(
    tx,
    submission,
    submissionId,
    stationId,
    resolvedLocationId,
    migratedPhotoIds,
    submissionPhotoSelectionRows,
  );

  const updated = await finalizeApprovedSubmission(tx, submission, submissionId, reviewerId, reviewerNotes);
  const stationStringId = getApprovedStationStringId(submission, draft.proposedStation, stationId, stationContext);

  return { submission: updated, resolvedStationId: stationId, stationStringId, attachmentUuidsToDelete, cellChanges, photosAdded };
}

export async function approveSubmissionAction({
  submissionId,
  reviewerId,
  reviewerNotes,
  req,
}: {
  submissionId: string;
  reviewerId: string;
  reviewerNotes?: string | null;
  req: FastifyRequest;
}) {
  const submission = await db.query.submissions.findFirst({ where: { id: submissionId } });
  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (submission.status !== "pending") throw new ErrorResponse("BAD_REQUEST", { message: "Only pending submissions can be approved" });

  const stationContext = await validatePublishedStation(submission);
  const duplicateCheckDraft = await loadApprovalDuplicateCheckDraft(submissionId);
  await checkApprovalCellDuplicates(submission, duplicateCheckDraft, stationContext);

  const transactionResult = await db.transaction((tx) =>
    runApprovalTransaction({
      tx,
      submission,
      submissionId,
      reviewerId,
      reviewerNotes,
      req,
      duplicateCheckDraft,
      stationContext,
    }),
  );

  const { submission: result, stationStringId } = transactionResult;
  void deleteAttachmentFiles(transactionResult.attachmentUuidsToDelete).catch((e) =>
    logger.error("Failed to delete orphaned location photo files after approval", { error: e instanceof Error ? e.message : String(e) }),
  );

  if (submission.type === "new") {
    void syncStationsPermitsAssociations().catch((e) =>
      logger.error("Failed to sync stations_permits after approval", { error: e instanceof Error ? e.message : String(e) }),
    );
  }

  await createAuditLog(
    {
      action: "submissions.approve",
      table_name: "submissions",
      record_id: null,
      old_values: { status: submission.status },
      new_values: { status: result.status, reviewer_id: result.reviewer_id, reviewed_at: result.reviewed_at },
      metadata: { submission_id: submissionId, type: submission.type, station_id: submission.station_id },
    },
    req,
  );

  const [reviewer, actionStation] = await Promise.all([
    db.query.users.findFirst({ where: { id: reviewerId }, columns: { name: true } }),
    transactionResult.resolvedStationId
      ? db.query.stations.findFirst({
          where: { id: transactionResult.resolvedStationId },
          columns: { id: true },
          with: { location: { columns: { latitude: true, longitude: true } } },
        })
      : Promise.resolve(null),
  ]);

  void createQueuedSubmissionApprovalNotification({
    userId: submission.submitter_id,
    submissionId: submissionId,
    stationId: transactionResult.resolvedStationId ?? undefined,
    metadata: {
      ...(stationStringId ? { station_id: stationStringId } : {}),
      ...(reviewer?.name ? { reviewer_name: reviewer.name } : {}),
      ...(result.review_notes ? { reviewer_note: result.review_notes.slice(0, 200) } : {}),
    },
    actionUrl: "/account/submissions",
  }).catch((e) => logger.error("Failed to send notification", { error: e }));

  if (transactionResult.resolvedStationId) {
    const actionUrl = actionStation ? buildInternalStationActionUrl(actionStation) : undefined;
    const addedCells = transactionResult.cellChanges.added.length;
    const removedCells = transactionResult.cellChanges.deleted.length;
    const updatedCells = transactionResult.cellChanges.updated.length;
    if (addedCells > 0 || removedCells > 0 || updatedCells > 0)
      void notifyStationWatchers({
        stationId: transactionResult.resolvedStationId,
        stationStringId,
        type: "station_cells_changed",
        metadata: { added: addedCells, removed: removedCells, updated: updatedCells },
        actionUrl,
      }).catch((e) => logger.error("Failed to notify station watchers about cell changes", { error: e }));
    if (transactionResult.photosAdded)
      void notifyStationWatchers({
        stationId: transactionResult.resolvedStationId,
        stationStringId,
        type: "station_photos_added",
        actionUrl,
      }).catch((e) => logger.error("Failed to notify station watchers about photos", { error: e }));
  }

  return { submission: result, station_id: stationStringId };
}
export async function rejectSubmissionAction({
  submissionId,
  reviewerId,
  reviewerNotes,
  req,
}: {
  submissionId: string;
  reviewerId: string;
  reviewerNotes?: string | null;
  req: FastifyRequest;
}) {
  const submission = await db.query.submissions.findFirst({ where: { id: submissionId } });
  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (submission.status !== "pending") throw new ErrorResponse("BAD_REQUEST", { message: "Only pending submissions can be approved" });

  const now = new Date();
  const [result] = await db
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
  if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

  await createAuditLog(
    {
      action: "submissions.reject",
      table_name: "submissions",
      record_id: null,
      old_values: submission,
      new_values: result,
      metadata: { submission_id: submissionId },
    },
    req,
  );

  const [reviewer, station] = await Promise.all([
    db.query.users.findFirst({ where: { id: reviewerId }, columns: { name: true } }),
    submission.station_id
      ? db.query.stations.findFirst({ where: { id: submission.station_id }, columns: { station_id: true } })
      : Promise.resolve(null),
  ]);
  const stationStringId = station?.station_id ?? null;

  void createAndDeliverNotification({
    userId: submission.submitter_id,
    type: "submission_rejected",
    submissionId: submissionId,
    stationId: submission.station_id ?? undefined,
    metadata: {
      ...(stationStringId ? { station_id: stationStringId } : {}),
      ...(reviewer?.name ? { reviewer_name: reviewer.name } : {}),
      ...(result.review_notes ? { reviewer_note: result.review_notes.slice(0, 200) } : {}),
    },
    actionUrl: "/account/submissions",
  }).catch((e) => logger.error("Failed to send notification", { error: e }));

  return result;
}
