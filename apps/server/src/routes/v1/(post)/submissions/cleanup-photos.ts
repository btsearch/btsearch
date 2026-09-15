import { attachments, submissionPhotos } from "@openbts/drizzle";
import { inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const schemaRoute = {
  response: {
    200: z.object({
      data: z.object({
        deleted: z.number(),
      }),
    }),
  },
};

type ResponseData = { deleted: number };

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<ResponseData>>) {
  if (!req.userSession?.user) throw new ErrorResponse("UNAUTHORIZED");

  const rejectedSubmissions = await db.query.submissions.findMany({
    where: {
      status: "rejected",
    },
    columns: { id: true },
  });

  if (rejectedSubmissions.length === 0) return res.send({ data: { deleted: 0 } });

  const submissionIds = rejectedSubmissions.map((s) => s.id);

  const photos = await db.query.submissionPhotos.findMany({
    where: {
      submission_id: { in: submissionIds },
    },
    columns: { id: true, attachment_id: true },
  });

  if (photos.length === 0) return res.send({ data: { deleted: 0 } });

  const photoIds = photos.map((p) => p.id);
  const attachmentIds = photos.map((p) => p.attachment_id);

  const attachmentRows = await db.query.attachments.findMany({
    where: {
      id: { in: attachmentIds },
    },
    columns: { id: true, uuid: true },
  });

  await runAuditedOperation(
    auditContextFromRequest(req),
    {
      kind: "submission.cleanup",
      allowEmpty: true,
      metadata: { deleted_count: attachmentRows.length },
    },
    async (tx) => {
      await tx.delete(submissionPhotos).where(inArray(submissionPhotos.id, photoIds));
      await tx.delete(attachments).where(inArray(attachments.id, attachmentIds));
    },
  );

  await Promise.all(attachmentRows.map(({ uuid }) => fs.unlink(path.join(UPLOAD_DIR, `${uuid}.webp`)).catch(() => {})));

  return res.send({ data: { deleted: attachmentRows.length } });
}

const cleanupRejectedPhotos: Route<Record<string, never>, ResponseData> = {
  url: "/submissions/cleanup-photos",
  method: "POST",
  config: { permissions: ["cleanup:submissions"] },
  schema: schemaRoute,
  handler,
};

export default cleanupRejectedPhotos;
