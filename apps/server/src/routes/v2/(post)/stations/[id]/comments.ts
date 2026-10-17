import { commentCreateSchema, commentSchema, stationCommentsParamsSchema } from "@openbts/shared/contract";
import type { Comment } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { actorIdFromRequest } from "../../../../../features/access/access.js";
import { findCommentViewRow, serializeComments } from "../../../../../features/comments/read.js";
import { createStationComment } from "../../../../../features/comments/write.js";
import { findVisibleStation } from "../../../../../features/stations/read.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "Add a comment to a station",
  description:
    "When comment review is enabled, the comment starts as `pending` until a moderator approves it. " +
    "If you can moderate comments for this station yourself, it is approved right away.",
  params: stationCommentsParamsSchema,
  response: {
    201: z.object({
      data: commentSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The request is not `multipart/form-data`, or a file was rejected. " +
    "An image that is smaller than 640 by 480 pixels or too blurry is rejected with `PHOTO_TOO_SMALL` or `PHOTO_TOO_BLURRY`.",
  403: "Comments are disabled.",
};
type ReqParams = { Params: z.infer<typeof stationCommentsParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Comment>>) {
  const { id } = req.params;
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");
  if (!getRuntimeSettings().enableStationComments) throw new ErrorResponse("FEATURE_DISABLED");

  if (!(req.headers["content-type"] ?? "").includes("multipart/form-data")) {
    throw new ErrorResponse("BAD_REQUEST", { message: "A comment must be sent as multipart/form-data" });
  }
  await findVisibleStation(req, id);

  const created = await createStationComment(req, id, userId);

  const row = await findCommentViewRow(created.id);
  if (!row) throw new ErrorResponse("FAILED_TO_CREATE");
  const [comment] = await serializeComments([row], await loadUserRefViewer(req));
  if (!comment) throw new ErrorResponse("FAILED_TO_CREATE");

  return res.status(201).send({ data: comment });
}

const createComment: Route<ReqParams, Comment> = {
  url: "/stations/:id/comments",
  method: "POST",
  config: { permissions: ["create:comments"], multipartBody: commentCreateSchema, errorReasons },
  schema: schemaRoute,
  handler,
};

export default createComment;
