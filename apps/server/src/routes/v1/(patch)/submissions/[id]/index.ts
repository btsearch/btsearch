import { proposedCells, proposedLocations, proposedSectors, proposedStations, submissions } from "@openbts/drizzle";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../../plugins/auth/utils.js";
import { createAuditLog } from "../../../../../services/auditLog.service.js";
import {
  checkCellDuplicatesBatch,
  checkLTEClidConsistency,
  checkPciDuplicates,
  getOperatorIdForStation,
} from "../../../../../services/cellDuplicateCheck.service.js";
import { getRuntimeSettings } from "../../../../../services/settings.service.js";
import type { DbTx } from "../../../../../types/global.js";
import {
  detailsSelectSchema,
  gsmInsertSchema,
  insertProposedCellDetails,
  isNonEmpty,
  lteInsertSchema,
  makeDetailsRatRefine,
  nrInsertSchemaBase,
  proposedCellsSelectSchema,
  umtsInsertSchema,
  validateCellDuplicates,
} from "../../../../../utils/submission.helpers.js";

const submissionsSelectSchema = createSelectSchema(submissions);

const cellInputSchema = createInsertSchema(proposedCells)
  .omit({ createdAt: true, updatedAt: true, submission_id: true })
  .extend({
    operation: z.enum(["add", "update", "delete"]).optional(),
    details: z.unknown().optional(),
  })
  .superRefine(makeDetailsRatRefine({ GSM: gsmInsertSchema, UMTS: umtsInsertSchema, LTE: lteInsertSchema, NR: nrInsertSchemaBase }));

const stationInputSchema = createInsertSchema(proposedStations).omit({ createdAt: true, updatedAt: true, submission_id: true }).partial();
const sectorInputSchema = createInsertSchema(proposedSectors).omit({ createdAt: true, updatedAt: true, submission_id: true }).strict();

const locationInputSchema = createInsertSchema(proposedLocations)
  .omit({ createdAt: true, updatedAt: true, submission_id: true })
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
type ProposedCellWithRelations = typeof proposedCells.$inferSelect & {
  gsm: ProposedCellDetails;
  umts: ProposedCellDetails;
  lte: ProposedCellDetails;
  nr: ProposedCellDetails;
};

function hasActualChanges(body: RequestBody, existing: ExistingSubmission): boolean {
  if (body.review_notes !== undefined && body.review_notes !== existing.review_notes) return true;
  if (body.submitter_note !== undefined && body.submitter_note !== existing.submitter_note) return true;

  if (isNonEmpty(body.station)) return true;
  if (isNonEmpty(body.location)) return true;
  if (body.sectors?.length) return true;
  if (body.cells?.length && body.cells.some(isNonEmpty)) return true;

  return false;
}

function buildSubmissionUpdate(body: RequestBody): Partial<typeof submissions.$inferInsert> {
  const updateFields: Partial<typeof submissions.$inferInsert> = { updatedAt: new Date() };
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

async function validateCellConflicts(
  cells: ProposedCellInput[] | undefined,
  stationId: number | null,
  proposedOperatorId?: number | null,
): Promise<void> {
  if (!cells || cells.length === 0) return;

  validateCellDuplicates(cells);
  const allModifiedCellIds = cells.map((cell) => cell.target_cell_id).filter((id): id is number => id !== null && id !== undefined);
  // await checkLTEClidConsistency(
  //   stationId,
  //   cells
  //     .filter((cell) => cell.operation !== "delete")
  //     .map((cell) => ({
  //       rat: cell.rat,
  //       details: cell.details as Record<string, unknown> | undefined,
  //       excludeCellId: cell.target_cell_id ?? undefined,
  //     })),
  //   allModifiedCellIds,
  //   proposedOperatorId,
  // );
  if (stationId !== null) {
    await checkPciDuplicates(stationId, getPciDuplicateSources(cells), allModifiedCellIds);
  }

  const operatorId = stationId !== null ? await getOperatorIdForStation(stationId) : null;
  if (operatorId !== null) {
    const entries = getCellDuplicateEntries(cells);
    if (entries.length > 0) await checkCellDuplicatesBatch(entries, operatorId);
  }
}

function validateSectorInputs(sectors: RequestBody["sectors"]): void {
  if (!sectors) return;

  const localIds = new Set<string>();
  const azimuths = new Set<number>();
  for (const sector of sectors) {
    if (localIds.has(sector.local_id)) throw new ErrorResponse("BAD_REQUEST", { message: "Sector local_id values must be unique" });
    localIds.add(sector.local_id);
    if (azimuths.has(sector.azimuth)) throw new ErrorResponse("BAD_REQUEST", { message: "Sector azimuth values must be unique" });
    azimuths.add(sector.azimuth);
  }
}

async function replaceProposedStation(tx: DbTx, submissionId: string, station: RequestBody["station"]): Promise<void> {
  if (!station) return;

  await tx.delete(proposedStations).where(eq(proposedStations.submission_id, submissionId));
  await tx.insert(proposedStations).values({ ...station, submission_id: submissionId } as typeof proposedStations.$inferInsert);
}

async function replaceProposedLocation(tx: DbTx, submissionId: string, location: RequestBody["location"]): Promise<void> {
  if (!location) return;

  await tx.delete(proposedLocations).where(eq(proposedLocations.submission_id, submissionId));
  await tx.insert(proposedLocations).values({ ...location, submission_id: submissionId } as typeof proposedLocations.$inferInsert);
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
    is_confirmed: hasAdminPermission ? (cell.is_confirmed ?? false) : false,
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

async function updateSubmissionDraft(tx: DbTx, submissionId: string, body: RequestBody, hasAdminPermission: boolean): Promise<ResponseData> {
  await tx.update(submissions).set(buildSubmissionUpdate(body)).where(eq(submissions.id, submissionId));

  await Promise.all([
    replaceProposedStation(tx, submissionId, body.station),
    replaceProposedLocation(tx, submissionId, body.location),
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
    verifyPermissions(session.user.id, { submissions: ["update"] }),
    db.query.submissions.findFirst({ where: { id } }),
  ]);

  if (!submission) throw new ErrorResponse("NOT_FOUND");

  const isOwner = submission.submitter_id === session.user.id;

  if (!hasAdminPermission && !isOwner) throw new ErrorResponse("FORBIDDEN");

  if (!hasAdminPermission && submission.status !== "pending")
    throw new ErrorResponse("BAD_REQUEST", { message: "Only pending submissions can be modified" });

  if (!hasAdminPermission && req.body.review_notes !== undefined) throw new ErrorResponse("FORBIDDEN", { message: "Cannot modify review notes" });

  if (!hasActualChanges(req.body, submission))
    throw new ErrorResponse("BAD_REQUEST", { message: "No changes detected. Please modify the data before updating." });

  validateSectorInputs(req.body.sectors);
  const existingProposedStation =
    submission.station_id === null && req.body.cells
      ? await db.query.proposedStations.findFirst({ where: { submission_id: id }, columns: { operator_id: true } })
      : null;
  await validateCellConflicts(req.body.cells, submission.station_id, req.body.station?.operator_id ?? existingProposedStation?.operator_id);

  try {
    const result = await db.transaction((tx) => updateSubmissionDraft(tx, id, req.body, hasAdminPermission));

    await createAuditLog(
      {
        action: "submissions.update",
        table_name: "submissions",
        record_id: undefined,
        old_values: submission,
        new_values: result,
        metadata: { submission_id: id },
      },
      req,
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
  schema: schemaRoute,
  handler,
};

export default updateSubmission;
