import { proposedCells, proposedLocations, proposedSectors, proposedStations, submissions } from "@openbts/drizzle";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { auditContextFromRequest, loadSubmissionDraftSnapshot, runAuditedOperation } from "../../../../../features/audit/index.js";
import { checkCellDuplicatesBatch, checkPciDuplicates, getOperatorIdForStation } from "../../../../../features/cells/duplicateCheck.js";
import { uplinkSpeedSchema } from "../../../../../features/stations/uplink.js";
import {
  changedLocationFields,
  changedStationFields,
  detailsSelectSchema,
  gsmInsertSchema,
  insertProposedCellDetails,
  isCompleteLocation,
  isNonEmpty,
  lteInsertSchema,
  makeDetailsRatRefine,
  normalizeText,
  nrInsertSchemaBase,
  proposedCellsSelectSchema,
  stripUnchangedProposalData,
  umtsInsertSchema,
  validateCellDuplicates,
  validateSectorChanges,
} from "../../../../../features/submissions/helpers.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../lib/runtimeSettings.js";
import { verifyPermissions } from "../../../../../plugins/auth/utils.js";
import type { DbTx } from "../../../../../types/global.js";

const submissionsSelectSchema = createSelectSchema(submissions);
const submissionInsertSchema = createInsertSchema(submissions);
const proposedStationInsertSchema = createInsertSchema(proposedStations);
const proposedLocationInsertSchema = createInsertSchema(proposedLocations);

const cellInputSchema = createInsertSchema(proposedCells)
  .omit({ createdAt: true, updatedAt: true, submission_id: true })
  .extend({
    operation: z.enum(["add", "update", "delete"]).optional(),
    details: z.unknown().optional(),
  })
  .superRefine(makeDetailsRatRefine({ GSM: gsmInsertSchema, UMTS: umtsInsertSchema, LTE: lteInsertSchema, NR: nrInsertSchemaBase }));

const stationInputSchema = createInsertSchema(proposedStations)
  .omit({ createdAt: true, updatedAt: true, submission_id: true, changed_fields: true })
  .extend({ uplink_speed: uplinkSpeedSchema.nullable().optional() })
  .partial();
const sectorInputSchema = createInsertSchema(proposedSectors).omit({ createdAt: true, updatedAt: true, submission_id: true }).strict();

const locationInputSchema = createInsertSchema(proposedLocations)
  .omit({ createdAt: true, updatedAt: true, submission_id: true, changed_fields: true })
  .partial()
  .superRefine((data, ctx) => {
    if (hasGenericAddressMarker(data.address))
      ctx.addIssue({ code: "custom", message: "Address must not contain variants of własny", path: ["address"] });
  });

const requestSchema = z.object({
  review_notes: z.string().nullable().optional(),
  submitter_note: z.string().optional(),
  station: stationInputSchema.optional(),
  location: locationInputSchema.optional(),
  sectors: z.array(sectorInputSchema).optional(),
  cells: z.array(cellInputSchema).optional(),
});

const responseSchema = submissionsSelectSchema.extend({
  sectors: z.array(createSelectSchema(proposedSectors)),
  cells: z.array(proposedCellsSelectSchema.extend({ details: detailsSelectSchema })),
});

const schemaRoute = {
  params: z.object({
    id: z.coerce.string<string>(),
  }),
  body: requestSchema,
  response: {
    200: z.object({
      data: responseSchema,
    }),
  },
};

type ReqParams = { Params: { id: string } };
type ReqBody = { Body: z.infer<typeof requestSchema> };
type RequestData = ReqParams & ReqBody;
type ResponseData = z.infer<typeof responseSchema>;
type ExistingSubmission = NonNullable<Awaited<ReturnType<typeof db.query.submissions.findFirst>>>;
type RequestBody = z.infer<typeof requestSchema>;
type ProposedCellInput = NonNullable<RequestBody["cells"]>[number];
type ProposedCellDetails = z.infer<typeof detailsSelectSchema>;
type SubmissionInsert = z.infer<typeof submissionInsertSchema>;
type ProposedCellWithRelations = z.infer<typeof proposedCellsSelectSchema> & {
  gsm: ProposedCellDetails;
  umts: ProposedCellDetails;
  lte: ProposedCellDetails;
  nr: ProposedCellDetails;
};

async function clearsStoredRows(submissionId: string, body: RequestBody): Promise<boolean> {
  const [storedSector, storedCell] = await Promise.all([
    body.sectors?.length === 0 ? db.query.proposedSectors.findFirst({ where: { submission_id: submissionId }, columns: { id: true } }) : null,
    body.cells?.length === 0 ? db.query.proposedCells.findFirst({ where: { submission_id: submissionId }, columns: { id: true } }) : null,
  ]);
  return Boolean(storedSector ?? storedCell);
}

async function hasActualChanges(body: RequestBody, existing: ExistingSubmission): Promise<boolean> {
  if (body.review_notes !== undefined && body.review_notes !== existing.review_notes) return true;
  if (body.submitter_note !== undefined && body.submitter_note !== existing.submitter_note) return true;

  if (body.station !== undefined) return true;
  if (body.location !== undefined) return true;
  if (body.sectors?.length) return true;
  if (body.cells?.some(isNonEmpty)) return true;

  return clearsStoredRows(existing.id, body);
}

function buildSubmissionUpdate(body: RequestBody): Partial<SubmissionInsert> {
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

function withCellDetails({ gsm, umts, lte, nr, ...base }: ProposedCellWithRelations): ResponseData["cells"][number] {
  return {
    ...base,
    details: gsm ?? umts ?? lte ?? nr ?? null,
  };
}

async function validateCellConflicts(cells: ProposedCellInput[] | undefined, stationId: number | null): Promise<void> {
  if (!cells || cells.length === 0) return;

  validateCellDuplicates(cells);
  const allModifiedCellIds = cells.map((cell) => cell.target_cell_id).filter((id): id is number => id !== null && id !== undefined);
  if (stationId !== null) {
    await checkPciDuplicates(stationId, getPciDuplicateSources(cells), allModifiedCellIds);
  }

  const operatorId = stationId !== null ? await getOperatorIdForStation(stationId) : null;
  if (operatorId !== null) {
    const entries = getCellDuplicateEntries(cells);
    if (entries.length > 0) await checkCellDuplicatesBatch(entries, operatorId);
  }
}

async function replaceProposedStation(tx: DbTx, submissionId: string, station: RequestBody["station"], isStationUpdate: boolean): Promise<void> {
  if (!station) return;

  await tx.delete(proposedStations).where(eq(proposedStations.submission_id, submissionId));
  await tx.insert(proposedStations).values({
    ...station,
    notes: normalizeText(station.notes),
    changed_fields: isStationUpdate ? changedStationFields(station) : null,
    submission_id: submissionId,
  } as z.infer<typeof proposedStationInsertSchema>);
}

async function replaceProposedLocation(tx: DbTx, submissionId: string, location: RequestBody["location"], isStationUpdate: boolean): Promise<void> {
  if (!location) return;

  await tx.delete(proposedLocations).where(eq(proposedLocations.submission_id, submissionId));
  await tx.insert(proposedLocations).values({
    ...location,
    changed_fields: isStationUpdate ? changedLocationFields(location) : null,
    submission_id: submissionId,
  } as z.infer<typeof proposedLocationInsertSchema>);
}

async function replaceProposedSectors(tx: DbTx, submissionId: string, sectors: RequestBody["sectors"]): Promise<void> {
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
      return insertProposedCellDetails(tx, cell.rat, cell.details as Record<string, unknown>, inserted.id);
    }),
  );
}

async function updateSubmissionDraft(
  tx: DbTx,
  submission: ExistingSubmission,
  body: RequestBody,
  hasAdminPermission: boolean,
): Promise<ResponseData> {
  const submissionId = submission.id;
  await tx.update(submissions).set(buildSubmissionUpdate(body)).where(eq(submissions.id, submissionId));

  const updatedStationId = submission.type === "update" ? submission.station_id : null;
  let stationBody = body.station;
  let locationBody = body.location;
  if (updatedStationId !== null && (stationBody || locationBody)) {
    const resolved = await stripUnchangedProposalData(tx, updatedStationId, stationBody, locationBody);
    if (stationBody && !resolved.stationData) await tx.delete(proposedStations).where(eq(proposedStations.submission_id, submissionId));
    if (locationBody && !resolved.locationData) await tx.delete(proposedLocations).where(eq(proposedLocations.submission_id, submissionId));
    stationBody = resolved.stationData;
    locationBody = resolved.locationData;
  }

  await Promise.all([
    replaceProposedStation(tx, submissionId, stationBody, updatedStationId !== null),
    replaceProposedLocation(tx, submissionId, locationBody, updatedStationId !== null),
    replaceProposedSectors(tx, submissionId, body.sectors),
    replaceProposedCells(tx, submissionId, body.cells, hasAdminPermission),
  ]);

  const [updated, sectors, rawCells] = await Promise.all([
    tx.query.submissions.findFirst({ where: { id: submissionId } }),
    tx.query.proposedSectors.findMany({ where: { submission_id: submissionId }, orderBy: { id: "asc" } }),
    tx.query.proposedCells.findMany({ where: { submission_id: submissionId }, with: { gsm: true, umts: true, lte: true, nr: true } }) as Promise<
      ProposedCellWithRelations[]
    >,
  ]);
  if (!updated) throw new ErrorResponse("NOT_FOUND");

  return { ...updated, sectors, cells: rawCells.map(withCellDetails) };
}

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FORBIDDEN");

  const { id } = req.params;
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const [hasAdminPermission, submission] = await Promise.all([
    verifyPermissions(session.user.id, { submissions: ["moderate"] }),
    db.query.submissions.findFirst({ where: { id } }),
  ]);

  if (!submission) throw new ErrorResponse("NOT_FOUND");

  const isOwner = submission.submitter_id === session.user.id;

  if (!hasAdminPermission && !isOwner) throw new ErrorResponse("FORBIDDEN");

  if (!hasAdminPermission && submission.status !== "pending")
    throw new ErrorResponse("BAD_REQUEST", { message: "Only pending submissions can be modified" });

  if (!hasAdminPermission && req.body.review_notes !== undefined) throw new ErrorResponse("FORBIDDEN", { message: "Cannot modify review notes" });

  if (!(await hasActualChanges(req.body, submission)))
    throw new ErrorResponse("BAD_REQUEST", { message: "No changes detected. Please modify the data before updating." });

  if (submission.type === "new" && req.body.station && typeof req.body.station.operator_id !== "number")
    throw new ErrorResponse("BAD_REQUEST", { message: "operator_id is required for new stations" });
  if (submission.type === "new" && req.body.location && !isCompleteLocation(req.body.location))
    throw new ErrorResponse("BAD_REQUEST", { message: "region_id, longitude and latitude are required for new station locations" });

  if (req.body.sectors) {
    const currentSectors =
      submission.station_id !== null
        ? await db.query.stationSectors.findMany({ where: { station_id: submission.station_id }, columns: { id: true, azimuth: true } })
        : [];
    validateSectorChanges(req.body.sectors, currentSectors, req.body.cells);
  }
  await validateCellConflicts(req.body.cells, submission.station_id);

  try {
    const result = await runAuditedOperation(
      auditContextFromRequest(req),
      { kind: "submission.update", metadata: { submission_id: id } },
      async (tx, audit) => {
        const oldSnapshot = await loadSubmissionDraftSnapshot(tx, id);
        if (!oldSnapshot) throw new ErrorResponse("NOT_FOUND");
        const updated = await updateSubmissionDraft(tx, submission, req.body, hasAdminPermission);
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
        return updated;
      },
    );

    return res.send({ data: result });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateSubmission: Route<RequestData, ResponseData> = {
  url: "/submissions/:id",
  method: "PATCH",
  config: { permissions: ["update:submissions"] },
  schema: schemaRoute,
  handler,
};

export default updateSubmission;
