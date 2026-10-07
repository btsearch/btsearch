import { commentParamsSchema, commentSchema, commentUpdateSchema } from "@openbts/shared/contract";
import type { Comment, CommentUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { findCommentViewRow, serializeComments } from "../../../../features/comments/read.js";
import { canModerateComments, updateStationComment } from "../../../../features/comments/write.js";
import { loadUserRefViewer } from "../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a comment",
  description:
    "Updates a comment and returns it. You can edit the text of your own comment. " +
    "Moderators can edit any comment, and only they can set `status`. " +
    "A moderator is an administrator, or an editor whose grant covers the comment's station. " +
    "When a pending comment is approved, users who watch the station are notified. " +
    "This endpoint keeps working while comments are disabled.",
  params: commentParamsSchema,
  body: commentUpdateSchema,
  response: {
    200: z.object({
      data: commentSchema,
    }),
  },
};
const errorReasons = {
  403: "You need to be the author or a moderator, and only a moderator can set `status`.",
  404: "The comment does not exist.",
};
type RequestData = { Params: z.infer<typeof commentParamsSchema>; Body: CommentUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Comment>>) {
  const { id } = req.params;
  const { content, status } = req.body;
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const existing = await db.query.stationComments.findFirst({ where: { id } });
  if (!existing) throw new ErrorResponse("NOT_FOUND");

  const canModerate = await canModerateComments(req, existing.station_id);
  if (existing.user_id !== userId && !canModerate) throw new ErrorResponse("FORBIDDEN");
  if (status !== undefined && !canModerate) throw new ErrorResponse("FORBIDDEN");

  await updateStationComment(req, existing, { content, status });

  const row = await findCommentViewRow(id);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  const [comment] = await serializeComments([row], await loadUserRefViewer(req));
  if (!comment) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: comment });
}

const updateComment: Route<RequestData, Comment> = {
  url: "/comments/:id",
  method: "PATCH",
  config: { permissions: ["update:comments"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default updateComment;
