import { attachments, submissionPhotos } from "@openbts/drizzle";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../../../plugins/auth/utils.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../../services/audit/index.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const schemaRoute = {
  params: z.object({ id: z.string(), photo_id: z.coerce.number() }),
  response: { 204: z.object({}) },
};

type ReqParams = { Params: { id: string; photo_id: number } };

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

  const attachment = await db.query.attachments.findFirst({ where: { id: photo.attachment_id } });

  await runAuditedOperation(auditContextFromRequest(req), { kind: "submission.photos", metadata: { submission_id: id } }, async (tx, audit) => {
    await tx.delete(submissionPhotos).where(and(eq(submissionPhotos.id, photo_id), eq(submissionPhotos.submission_id, id)));
    if (attachment) await tx.delete(attachments).where(eq(attachments.id, attachment.id));

    await audit.log({
      entity: "submission_photos",
      op: "delete",
      recordId: photo_id,
      stationId: submission.station_id,
      old: photo,
    });
  });

  if (attachment) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, `${attachment.uuid}.webp`));
    } catch {}
  }

  return res.code(204).send({});
}

const deleteSubmissionPhoto: Route<ReqParams, Record<never, never>> = {
  url: "/submissions/:id/photos/:photo_id",
  method: "DELETE",
  config: { permissions: ["delete:submissions"] },
  schema: schemaRoute,
  handler,
};

export default deleteSubmissionPhoto;
