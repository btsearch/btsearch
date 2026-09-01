import { stationComments } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../../../plugins/auth/utils.js";
import { createAuditLog } from "../../../../../../services/auditLog.service.js";
import { buildInternalStationActionUrl } from "../../../../../../services/notifications/actionUrls.js";
import { notifyStationWatchers } from "../../../../../../services/notifications/service.js";
import { logger } from "../../../../../../utils/logger.js";

const stationCommentSelectSchema = createSelectSchema(stationComments);

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
    comment_id: z.uuid(),
  }),
  body: z
    .object({
      content: z.string().min(1).max(10000).optional(),
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

  const isPrivileged = await verifyPermissions(userId, { comments: ["update"] });
  if (comment.user_id !== userId && !isPrivileged) throw new ErrorResponse("FORBIDDEN");

  if (approve !== undefined && !isPrivileged) throw new ErrorResponse("FORBIDDEN");

  const [updated] = await db
    .update(stationComments)
    .set({
      ...(content !== undefined && { content }),
      ...(approve !== undefined && { status: approve ? "approved" : "pending" }),
      updatedAt: new Date(),
    })
    .where(eq(stationComments.id, comment_id))
    .returning();

  if (!updated) throw new ErrorResponse("INTERNAL_SERVER_ERROR");

  await createAuditLog(
    {
      action: "station_comments.update",
      table_name: "station_comments",
      old_values: comment,
      new_values: updated,
      metadata: { comment_id },
    },
    req,
  );

  if (approve === true && comment.status !== "approved") {
    const station = await db.query.stations.findFirst({
      where: { id: station_id },
      columns: { id: true, station_id: true },
      with: { location: { columns: { latitude: true, longitude: true } } },
    });
    void notifyStationWatchers({
      stationId: station_id,
      stationStringId: station?.station_id ?? null,
      type: "station_comment_approved",
      actionUrl: station ? buildInternalStationActionUrl(station) : undefined,
    }).catch((e) => logger.error("Failed to notify station watchers about approved comment", { error: e }));
  }

  return res.send({ data: updated });
}

const updateComment: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id/comments/:comment_id",
  method: "PATCH",
  schema: schemaRoute,
  handler,
};

export default updateComment;
