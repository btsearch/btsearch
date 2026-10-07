import {
  proposedCells,
  proposedLocations,
  proposedSectors,
  proposedStations,
  submissionLocationPhotoSelections,
  submissionPhotos,
  submissions,
} from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createInsertSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import { locationRefs, requestCovers } from "../access/scope.js";
import { hasStaffPermission } from "../access/staff.js";
import { auditContextFromRequest, loadSubmissionDraftSnapshot, runAuditedOperation } from "../audit/index.js";
import { validateCellBandsInCountry } from "../cells/arfcnValidation.js";
import { checkCellDuplicatesBatch, checkPciDuplicates, getOperatorIdForStation } from "../cells/duplicateCheck.js";
import { NORMAL_RATS } from "../cells/ratCellPersistence.js";
import { findPlacementCountryCode } from "../stations/country.js";
import { uplinkSpeedSchema } from "../stations/uplink.js";
import { assertCountriesOpen, loadCurrentLocations } from "./contributions.js";
import { type PhotoPickInput, assertTargetCellsFit, insertPhotoPicks, nrInsertSchema, refuseGenericAddress } from "./create.js";
import {
  changedLocationFields,
  changedStationFields,
  getProposedLocationChanges,
  gsmInsertSchema,
  insertProposedCellDetails,
  isCompleteLocation,
  isNonEmpty,
  lteInsertSchema,
  makeDetailsRatRefine,
  normalizeText,
  stampSubmissionCountry,
  stripUnchangedProposalData,
  umtsInsertSchema,
  validateCellDuplicates,
  validateSectorChanges,
} from "./helpers.js";
import { lockSubmission } from "./lock.js";

const submissionInsertSchema = createInsertSchema(submissions);
const proposedStationInsertSchema = createInsertSchema(proposedStations);
const proposedLocationInsertSchema = createInsertSchema(proposedLocations);

const cellInputSchema = createInsertSchema(proposedCells)
  .omit({ createdAt: true, updatedAt: true, submission_id: true })
  .extend({
    rat: z.enum(NORMAL_RATS).nullable().optional(),
    operation: z.enum(["add", "update", "delete"]).optional(),
    details: z.unknown().optional(),
  })
  .superRefine(makeDetailsRatRefine({ GSM: gsmInsertSchema, UMTS: umtsInsertSchema, LTE: lteInsertSchema, NR: nrInsertSchema }));

const stationInputSchema = createInsertSchema(proposedStations)
  .omit({ createdAt: true, updatedAt: true, submission_id: true, changed_fields: true })
  .extend({ uplink_speed: uplinkSpeedSchema.nullable().optional() })
  .partial();
const sectorInputSchema = createInsertSchema(proposedSectors).omit({ createdAt: true, updatedAt: true, submission_id: true }).strict();

const locationInputSchema = createInsertSchema(proposedLocations)
  .omit({ createdAt: true, updatedAt: true, submission_id: true, changed_fields: true })
  .partial()
  .superRefine(refuseGenericAddress);

const submissionUpdateBodySchema = z.object({
  review_notes: z.string().nullable().optional(),
  submitter_note: z.string().nullable().optional(),
  station: stationInputSchema.optional(),
  location: locationInputSchema.optional(),
  sectors: z.array(sectorInputSchema).optional(),
  cells: z.array(cellInputSchema).optional(),
});

export type SubmissionUpdateBody = z.infer<typeof submissionUpdateBodySchema>;
type ExistingSubmission = NonNullable<Awaited<ReturnType<typeof db.query.submissions.findFirst>>>;
export type EditableSubmission = { submission: ExistingSubmission; hasAdminPermission: boolean };
type ProposedCellInput = NonNullable<SubmissionUpdateBody["cells"]>[number];
type ProposedLocationInput = NonNullable<SubmissionUpdateBody["location"]>;
type SubmissionInsert = z.infer<typeof submissionInsertSchema>;

async function clearsStoredRows(submissionId: string, body: SubmissionUpdateBody): Promise<boolean> {
  const [storedSector, storedCell] = await Promise.all([
    body.sectors?.length === 0 ? db.query.proposedSectors.findFirst({ where: { submission_id: submissionId }, columns: { id: true } }) : null,
    body.cells?.length === 0 ? db.query.proposedCells.findFirst({ where: { submission_id: submissionId }, columns: { id: true } }) : null,
  ]);
  return Boolean(storedSector ?? storedCell);
}

async function hasActualChanges(body: SubmissionUpdateBody, existing: ExistingSubmission, picks: PhotoPickInput | undefined): Promise<boolean> {
  if (picks !== undefined) return true;
  if (body.review_notes !== undefined && body.review_notes !== existing.review_notes) return true;
  if (body.submitter_note !== undefined && body.submitter_note !== existing.submitter_note) return true;

  if (body.station !== undefined) return true;
  if (body.location !== undefined) return true;
  if (body.sectors?.length) return true;
  if (body.cells?.some(isNonEmpty)) return true;

  return clearsStoredRows(existing.id, body);
}

function buildSubmissionUpdate(body: SubmissionUpdateBody): Partial<SubmissionInsert> {
  const updateFields: Partial<SubmissionInsert> = { updatedAt: new Date() };
  if (body.review_notes !== undefined) updateFields.review_notes = body.review_notes;
  if (body.submitter_note !== undefined) updateFields.submitter_note = body.submitter_note;
  return updateFields;
}

function getCellDuplicateEntries(cells: ProposedCellInput[]): { rat: string; details: Record<string, unknown>; excludeCellId?: number }[] {
  return cells
    .filter((cell) => cell.details && cell.operation !== "delete")
    .map((cell) => ({
      rat: cell.rat!,
      details: cell.details as Record<string, unknown>,
      excludeCellId: cell.target_cell_id ?? undefined,
    }));
}

function getPciDuplicateSources(cells: ProposedCellInput[]) {
  return cells
    .filter((cell) => cell.operation !== "delete")
    .map((cell) => ({
      rat: cell.rat,
      bandId: cell.band_id,
      details: cell.details as Record<string, unknown> | undefined,
      excludeCellId: cell.target_cell_id ?? undefined,
    }));
}

async function validateCellConflicts(cells: ProposedCellInput[] | undefined, stationId: number | null): Promise<void> {
  if (!cells || cells.length === 0) return;

  await assertTargetCellsFit(cells, stationId);
  validateCellDuplicates(cells);
  const allModifiedCellIds = cells.map((cell) => cell.target_cell_id).filter((id): id is number => id !== null && id !== undefined);
  if (stationId !== null) await checkPciDuplicates(stationId, getPciDuplicateSources(cells), allModifiedCellIds);

  const operatorId = stationId !== null ? await getOperatorIdForStation(stationId) : null;
  if (operatorId !== null) {
    const entries = getCellDuplicateEntries(cells);
    if (entries.length > 0) await checkCellDuplicatesBatch(entries, operatorId, allModifiedCellIds);
  }
}

async function assertStationTakesChanges(stationId: number | null): Promise<void> {
  if (stationId === null) return;

  const station = await db.query.stations.findFirst({ where: { id: stationId }, columns: { status: true } });
  if (station?.status !== "published" && station?.status !== "pending") throw new ErrorResponse("NOT_FOUND", { message: "Station not found" });
}

async function loadCellsCountryCode(submissionId: string, stationId: number | null, body: SubmissionUpdateBody): Promise<string | null> {
  const [storedLocation, storedStation] = await Promise.all([
    body.location === undefined
      ? db.query.proposedLocations.findFirst({ where: { submission_id: submissionId }, columns: { region_id: true } })
      : undefined,
    body.station === undefined
      ? db.query.proposedStations.findFirst({ where: { submission_id: submissionId }, columns: { operator_id: true } })
      : undefined,
  ]);
  return findPlacementCountryCode({
    stationId,
    regionId: body.location === undefined ? storedLocation?.region_id : body.location.region_id,
    operatorId: body.station === undefined ? storedStation?.operator_id : body.station.operator_id,
  });
}

async function replaceProposedStation(
  tx: DbTx,
  submissionId: string,
  station: SubmissionUpdateBody["station"],
  isStationUpdate: boolean,
): Promise<void> {
  if (!station) return;

  await tx.delete(proposedStations).where(eq(proposedStations.submission_id, submissionId));
  await tx.insert(proposedStations).values({
    ...station,
    notes: normalizeText(station.notes),
    changed_fields: isStationUpdate ? changedStationFields(station) : null,
    submission_id: submissionId,
  } as z.infer<typeof proposedStationInsertSchema>);
}

async function keepStoredStructure(tx: DbTx, submissionId: string, location: ProposedLocationInput): Promise<ProposedLocationInput> {
  const stored = await tx.query.proposedLocations.findFirst({ where: { submission_id: submissionId } });
  if (!stored) return location;

  const proposed = getProposedLocationChanges(stored);
  const keepsOwner = location.structure_owner_id === undefined;
  return {
    ...location,
    structure_type: location.structure_type === undefined ? proposed.structure_type : location.structure_type,
    structure_owner_id: keepsOwner ? proposed.structure_owner_id : location.structure_owner_id,
    structure_owner_name: keepsOwner ? proposed.structure_owner_name : location.structure_owner_name,
    structure_note: location.structure_note === undefined ? proposed.structure_note : location.structure_note,
  };
}

async function replaceProposedLocation(
  tx: DbTx,
  submissionId: string,
  location: SubmissionUpdateBody["location"],
  isStationUpdate: boolean,
  move: ProposedLocationInput["move"],
): Promise<void> {
  if (!location) return;

  const [stored] = await tx
    .delete(proposedLocations)
    .where(eq(proposedLocations.submission_id, submissionId))
    .returning({ move: proposedLocations.move });
  await tx.insert(proposedLocations).values({
    ...location,
    move: move ?? stored?.move ?? "station",
    changed_fields: isStationUpdate ? changedLocationFields(location) : null,
    submission_id: submissionId,
  } as z.infer<typeof proposedLocationInsertSchema>);
}

async function replaceProposedSectors(tx: DbTx, submissionId: string, sectors: SubmissionUpdateBody["sectors"]): Promise<void> {
  if (!sectors) return;

  await tx.delete(proposedSectors).where(eq(proposedSectors.submission_id, submissionId));
  if (sectors.length > 0) await tx.insert(proposedSectors).values(sectors.map((sector) => ({ ...sector, submission_id: submissionId })));
}

async function replaceProposedCells(
  tx: DbTx,
  submissionId: string,
  cells: ProposedCellInput[] | undefined,
  hasAdminPermission: boolean,
): Promise<void> {
  if (!cells) return;

  await tx.delete(proposedCells).where(eq(proposedCells.submission_id, submissionId));
  if (cells.length === 0) return;

  const insertRows = cells.map(({ details: _details, ...cell }) => ({
    ...cell,
    submission_id: submissionId,
    is_confirmed: hasAdminPermission && (cell.is_confirmed ?? false),
    operation: cell.operation ?? "add",
  }));

  const insertedCells = await tx.insert(proposedCells).values(insertRows).returning({ id: proposedCells.id });
  if (insertedCells.length !== cells.length) throw new ErrorResponse("FAILED_TO_UPDATE");

  await Promise.all(
    insertedCells.map((inserted, index) => {
      const cell = cells[index];
      if (!cell || !cell.details || cell.operation === "delete") return Promise.resolve();
      const targetCellId = cell.operation === "update" ? (cell.target_cell_id ?? null) : null;
      return insertProposedCellDetails(tx, cell.rat, cell.details as Record<string, unknown>, inserted.id, targetCellId);
    }),
  );
}

async function replacePhotoPicks(tx: DbTx, submissionId: string, picks: PhotoPickInput | undefined): Promise<void> {
  if (!picks) return;

  await tx.delete(submissionLocationPhotoSelections).where(eq(submissionLocationPhotoSelections.submission_id, submissionId));
  await insertPhotoPicks(tx, submissionId, picks);
  if (picks.main_location_photo_id !== undefined) {
    await tx.update(submissionPhotos).set({ is_main: false }).where(eq(submissionPhotos.submission_id, submissionId));
  }
}

async function updateSubmissionDraft(
  tx: DbTx,
  submission: ExistingSubmission,
  body: SubmissionUpdateBody,
  hasAdminPermission: boolean,
  picks: PhotoPickInput | undefined,
): Promise<void> {
  const submissionId = submission.id;
  await tx.update(submissions).set(buildSubmissionUpdate(body)).where(eq(submissions.id, submissionId));

  const updatedStationId = submission.type === "update" ? submission.station_id : null;
  let stationBody = body.station;
  let locationBody = body.location && (await keepStoredStructure(tx, submissionId, body.location));
  if (updatedStationId !== null && (stationBody || locationBody)) {
    const resolved = await stripUnchangedProposalData(tx, updatedStationId, stationBody, locationBody);
    if (stationBody && !resolved.stationData) await tx.delete(proposedStations).where(eq(proposedStations.submission_id, submissionId));
    if (locationBody && !resolved.locationData) await tx.delete(proposedLocations).where(eq(proposedLocations.submission_id, submissionId));
    stationBody = resolved.stationData;
    locationBody = resolved.locationData;
  }

  await Promise.all([
    replaceProposedStation(tx, submissionId, stationBody, updatedStationId !== null),
    replaceProposedLocation(tx, submissionId, locationBody, updatedStationId !== null, body.location?.move),
    replaceProposedSectors(tx, submissionId, body.sectors),
    replaceProposedCells(tx, submissionId, body.cells, hasAdminPermission),
    replacePhotoPicks(tx, submissionId, picks),
  ]);
  if (body.station || body.location) await stampSubmissionCountry(tx, submissionId);
}

export function getTargetStationId(submission: Pick<ExistingSubmission, "type" | "station_id">): number | null {
  return submission.type === "new" ? null : submission.station_id;
}

export function assertDeleteCarriesOnlyNotes(submission: Pick<ExistingSubmission, "type">, changesContent: boolean): void {
  if (submission.type === "delete" && changesContent) throw new ErrorResponse("BAD_REQUEST", { message: "A delete carries no changes, only a note" });
}

export async function findEditableSubmission(req: FastifyRequest, id: string, userId: string): Promise<EditableSubmission> {
  const [canModerate, submission] = await Promise.all([
    hasStaffPermission(req, { submissions: ["moderate"] }),
    db.query.submissions.findFirst({ where: { id } }),
  ]);

  if (!submission) throw new ErrorResponse("NOT_FOUND");

  const hasAdminPermission = canModerate && (await requestCovers(req, { submissionIds: [id] }));
  const isOwner = submission.submitter_id === userId;

  if (!hasAdminPermission && !isOwner) throw new ErrorResponse("FORBIDDEN");

  if (!hasAdminPermission && submission.status !== "pending") {
    throw new ErrorResponse("BAD_REQUEST", { message: "Only pending submissions can be modified" });
  }

  return { submission, hasAdminPermission };
}

export async function updateSubmission(
  req: FastifyRequest,
  { submission, hasAdminPermission }: EditableSubmission,
  body: SubmissionUpdateBody,
  picks?: PhotoPickInput,
): Promise<void> {
  const id = submission.id;

  if (!hasAdminPermission && body.review_notes !== undefined) throw new ErrorResponse("FORBIDDEN", { message: "Cannot modify review notes" });
  const changesContent = [body.station, body.location, body.sectors, body.cells, picks].some((part) => part !== undefined);
  assertDeleteCarriesOnlyNotes(submission, changesContent);

  if (!(await hasActualChanges(body, submission, picks))) {
    throw new ErrorResponse("BAD_REQUEST", { message: "No changes detected. Please modify the data before updating." });
  }
  const stationId = getTargetStationId(submission);
  const current = stationId !== null && body.location ? (await loadCurrentLocations([stationId])).get(stationId) : null;
  await assertCountriesOpen(req, {
    ...locationRefs(body.location, current),
    stationIds: stationId !== null && changesContent ? [stationId] : [],
    placements:
      submission.type === "new" && typeof body.station?.operator_id === "number" ? [{ locationId: null, operatorId: body.station.operator_id }] : [],
  });
  if (changesContent && submission.status === "pending") await assertStationTakesChanges(stationId);

  if (submission.type === "new" && body.station && !body.station.station_id?.trim()) {
    throw new ErrorResponse("BAD_REQUEST", { message: "A new station needs a station ID" });
  }
  if (submission.type === "new" && body.station && typeof body.station.operator_id !== "number") {
    throw new ErrorResponse("BAD_REQUEST", { message: "operator_id is required for new stations" });
  }
  if (submission.type === "new" && body.station && !body.station.uplink_type && typeof body.station.uplink_speed === "number") {
    throw new ErrorResponse("BAD_REQUEST", { message: "A new station's uplink speed needs an uplink type" });
  }
  if (submission.type === "new" && body.location && !isCompleteLocation(body.location)) {
    throw new ErrorResponse("BAD_REQUEST", { message: "A region and coordinates are required for a new station's location" });
  }

  if (body.sectors || body.cells) {
    const [currentSectors, storedSectors, storedCells] = await Promise.all([
      stationId !== null ? db.query.stationSectors.findMany({ where: { station_id: stationId }, columns: { id: true, azimuth: true } }) : [],
      body.sectors ? [] : db.query.proposedSectors.findMany({ where: { submission_id: id } }),
      body.cells ? [] : db.query.proposedCells.findMany({ where: { submission_id: id }, columns: { target_sector_id: true, sector_local_id: true } }),
    ]);
    validateSectorChanges(body.sectors ?? storedSectors, currentSectors, body.cells ?? storedCells);
  }
  await validateCellConflicts(body.cells, stationId);
  if (body.cells && body.cells.length > 0) {
    const countryCode = await loadCellsCountryCode(id, stationId, body);
    await validateCellBandsInCountry(
      body.cells.filter((cell) => cell.operation !== "delete"),
      countryCode,
    );
  }

  try {
    await runAuditedOperation(auditContextFromRequest(req), { kind: "submission.update", metadata: { submission_id: id } }, async (tx, audit) => {
      const locked = await lockSubmission(tx, id);
      if (!locked) throw new ErrorResponse("NOT_FOUND");
      if (locked.status !== submission.status) throw new ErrorResponse("CONFLICT", { message: "This submission has just been reviewed" });

      const oldSnapshot = await loadSubmissionDraftSnapshot(tx, id);
      if (!oldSnapshot) throw new ErrorResponse("NOT_FOUND");
      await updateSubmissionDraft(tx, submission, body, hasAdminPermission, picks);
      const newSnapshot = await loadSubmissionDraftSnapshot(tx, id);
      if (!newSnapshot) throw new ErrorResponse("NOT_FOUND");
      await audit.log({
        entity: "submissions",
        op: "update",
        recordId: id,
        stationId: submission.station_id,
        old: oldSnapshot,
        new: newSnapshot,
      });
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}
