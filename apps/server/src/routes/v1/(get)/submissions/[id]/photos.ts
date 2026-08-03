import { attachments, submissionPhotos, users } from "@openbts/drizzle";
import { asc, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../../plugins/auth/utils.js";

const photoSchema = z.object({
  id: z.number(),
  attachment_uuid: z.string(),
  mime_type: z.string(),
  note: z.string().nullable(),
  taken_at: z.string().nullable(),
  is_main: z.boolean(),
  createdAt: z.string(),
  author: z.object({ uuid: z.string(), username: z.string(), name: z.string() }).nullable(),
});

const schemaRoute = {
  params: z.object({ id: z.string() }),
  response: { 200: z.object({ data: z.array(photoSchema) }) },
};

type ReqParams = { Params: { id: string } };
type PhotoItem = z.infer<typeof photoSchema>;

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<PhotoItem[]>>) {
  const { id } = req.params;
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const hasAdminPermission = (await verifyPermissions(session.user.id, { submissions: ["read"] })) || false;

  const submission = await db.query.submissions.findFirst({ where: { id }, columns: { id: true, submitter_id: true } });
  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (!hasAdminPermission && submission.submitter_id !== session.user.id) throw new ErrorResponse("NOT_FOUND");

  const rows = await db
    .select({
      id: submissionPhotos.id,
      attachment_uuid: attachments.uuid,
      mime_type: attachments.mime_type,
      note: submissionPhotos.note,
      taken_at: submissionPhotos.taken_at,
      is_main: submissionPhotos.is_main,
      createdAt: submissionPhotos.createdAt,
      author_uuid: users.id,
      author_username: users.username,
      author_name: users.name,
    })
    .from(submissionPhotos)
    .innerJoin(attachments, eq(submissionPhotos.attachment_id, attachments.id))
    .leftJoin(users, eq(attachments.author_id, users.id))
    .where(eq(submissionPhotos.submission_id, id))
    .orderBy(asc(submissionPhotos.createdAt));

  return res.send({
    data: rows.map((r) => ({
      id: r.id,
      attachment_uuid: r.attachment_uuid,
      mime_type: r.mime_type,
      note: r.note,
      taken_at: r.taken_at?.toISOString() ?? null,
      is_main: r.is_main,
      createdAt: r.createdAt.toISOString(),
      author: r.author_uuid && r.author_username ? { uuid: r.author_uuid, username: r.author_username, name: r.author_name ?? "" } : null,
    })),
  });
}

const getSubmissionPhotos: Route<ReqParams, PhotoItem[]> = {
  url: "/submissions/:id/photos",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getSubmissionPhotos;
