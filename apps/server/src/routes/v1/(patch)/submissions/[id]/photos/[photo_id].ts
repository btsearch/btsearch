import { submissionPhotos } from "@openbts/drizzle";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../../../plugins/auth/utils.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../../services/audit/index.js";

const schemaRoute = {
  params: z.object({ id: z.string(), photo_id: z.coerce.number() }),
  body: z
    .object({
      note: z.string().max(100).optional(),
      taken_at: z.iso.datetime().nullable().optional(),
    })
    .refine((b) => b.note !== undefined || b.taken_at !== undefined, { message: "At least one field required" }),
  response: { 204: z.object({}) },
};

type ReqParams = { Params: { id: string; photo_id: number }; Body: { note?: string; taken_at?: string | null } };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Record<never, never>>>) {
  const { id, photo_id } = req.params;
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const hasAdminPermission = await verifyPermissions(session.user.id, { submissions: ["moderate"] });

  const submission = await db.query.submissions.findFirst({
    where: { id },
    columns: { id: true, submitter_id: true, status: true, station_id: true },
  });
  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (submission.status !== "pending") throw new ErrorResponse("FORBIDDEN");

  const isSubmitter = submission.submitter_id === session.user.id;
  if (!hasAdminPermission && !isSubmitter) throw new ErrorResponse("FORBIDDEN");

  const photo = await db.query.submissionPhotos.findFirst({ where: { id: photo_id, submission_id: id } });
  if (!photo) throw new ErrorResponse("NOT_FOUND");

  const setClause: Record<string, unknown> = {};
  if (req.body.note !== undefined) setClause.note = req.body.note.trim() || null;
  if (req.body.taken_at !== undefined) setClause.taken_at = req.body.taken_at ? new Date(req.body.taken_at) : null;

  await runAuditedOperation(auditContextFromRequest(req), { kind: "submission.photos", metadata: { submission_id: id } }, async (tx, audit) => {
    const [updated] = await tx
      .update(submissionPhotos)
      .set(setClause)
      .where(and(eq(submissionPhotos.id, photo_id), eq(submissionPhotos.submission_id, id)))
      .returning();
    if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");

    await audit.log({
      entity: "submission_photos",
      op: "update",
      recordId: photo_id,
      stationId: submission.station_id,
      old: photo,
      new: updated,
    });
  });

  return res.code(204).send({});
}

const patchSubmissionPhoto: Route<ReqParams, Record<never, never>> = {
  url: "/submissions/:id/photos/:photo_id",
  method: "PATCH",
  schema: schemaRoute,
  config: { permissions: ["update:submissions"] },
  handler,
};

export default patchSubmissionPhoto;
