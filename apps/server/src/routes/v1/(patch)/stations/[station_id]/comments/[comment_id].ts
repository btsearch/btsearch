import { stationComments } from "@openbts/drizzle";
import { COMMENT_MAX_LENGTH } from "@openbts/shared/contract";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import { type CommentChanges, canModerateComments, updateStationComment } from "../../../../../../features/comments/write.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const stationCommentSelectSchema = createSelectSchema(stationComments);

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
    comment_id: z.uuid(),
  }),
  body: z
    .object({
      content: z.string().trim().min(1).max(COMMENT_MAX_LENGTH).optional(),
      approve: z.boolean().optional(),
    })
    .refine((b) => b.content !== undefined || b.approve !== undefined, { message: "At least one field required" }),
  response: {
    200: z.object({
      data: stationCommentSelectSchema,
    }),
  },
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type ReqBody = { Body: z.infer<typeof schemaRoute.body> };
type RequestData = ReqParams & ReqBody;
type ResponseData = z.infer<typeof stationCommentSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id, comment_id } = req.params;
  const { content, approve } = req.body;

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

  if (approve !== undefined && !isPrivileged) throw new ErrorResponse("FORBIDDEN");

  let status: CommentChanges["status"];
  if (approve !== undefined) status = approve ? "approved" : "pending";

  const updated = await updateStationComment(req, comment, { content, status });

  return res.send({ data: updated });
}

const updateComment: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id/comments/:comment_id",
  method: "PATCH",
  config: { permissions: ["update:comments"] },
  schema: schemaRoute,
  handler,
};

export default updateComment;
