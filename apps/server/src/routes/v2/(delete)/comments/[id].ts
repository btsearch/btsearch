import { commentParamsSchema, noContentSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { canModerateComments, removeStationComment } from "../../../../features/comments/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a comment",
  description:
    "Deletes a comment along with the photos attached to it. " +
    "You need to be the author or a moderator, which means an administrator or an editor whose grant covers the comment's station. " +
    "This endpoint keeps working while comments are disabled.",
  params: commentParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  403: "You need to be the author or a moderator.",
  404: "The comment does not exist.",
};
type ReqParams = { Params: z.infer<typeof commentParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const existing = await db.query.stationComments.findFirst({ where: { id } });
  if (!existing) throw new ErrorResponse("NOT_FOUND");
  if (existing.user_id !== userId && !(await canModerateComments(req, existing.station_id))) throw new ErrorResponse("FORBIDDEN");

  try {
    await removeStationComment(req, existing);
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteComment: Route<ReqParams, void> = {
  url: "/comments/:id",
  method: "DELETE",
  config: { permissions: ["delete:comments"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default deleteComment;
