import { notifications } from "@openbts/drizzle";
import { notificationParamsSchema, notificationSchema } from "@openbts/shared/contract";
import type { Notification } from "@openbts/shared/contract";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { accountOwnerId } from "../../../../../features/notifications/owner.js";
import { serializeNotifications } from "../../../../../features/notifications/read.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Mark a notification as read",
  description:
    "Marks one of your notifications as read and returns it. If it was already read, nothing changes and `readAt` keeps its original time.",
  params: notificationParamsSchema,
  response: {
    200: z.object({
      data: notificationSchema,
    }),
  },
};
const errorReasons = {
  401: "You are not signed in, or the token you sent is invalid. API keys are not accepted here, so use a session or an OAuth token.",
  403:
    "The OAuth token does not have the `profile` scope. " +
    "Also returned when two-factor authentication still has to be set up or the endpoint is disabled.",
  404: "The notification does not exist or is not yours.",
};
type ReqParams = { Params: z.infer<typeof notificationParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Notification>>) {
  const userId = accountOwnerId(req);

  const [updated] = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)))
    .returning();
  if (!updated) throw new ErrorResponse("NOT_FOUND");

  const [notification] = await serializeNotifications([updated], await loadUserRefViewer(req));
  if (!notification) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: notification });
}

const markNotificationRead: Route<ReqParams, Notification> = {
  url: "/notifications/:id/read",
  method: "PUT",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default markNotificationRead;
