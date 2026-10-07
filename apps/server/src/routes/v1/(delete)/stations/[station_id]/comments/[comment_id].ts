import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import { canModerateComments, removeStationComment } from "../../../../../../features/comments/write.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
    comment_id: z.uuid(),
  }),
};
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { station_id, comment_id } = req.params;

  if (Number.isNaN(station_id)) throw new ErrorResponse("INVALID_QUERY");

  const userId = req.userSession?.user.id;
  if (!userId) throw new ErrorResponse("UNAUTHORIZED");

  const comment = await db.query.stationComments.findFirst({
    where: {
      AND: [{ id: { eq: comment_id } }, { station_id: { eq: station_id } }],
    },
  });
  if (!comment) throw new ErrorResponse("NOT_FOUND");

  const isPrivileged = await canModerateComments(req, station_id);
  if (comment.user_id !== userId && !isPrivileged) throw new ErrorResponse("FORBIDDEN");

  try {
    await removeStationComment(req, comment);

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
}

const deleteComment: Route<ReqParams, void> = {
  url: "/stations/:station_id/comments/:comment_id",
  method: "DELETE",
  config: { permissions: ["delete:comments"] },
  schema: schemaRoute,
  handler,
};

export default deleteComment;
