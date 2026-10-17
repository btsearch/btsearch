import { notifications } from "@openbts/drizzle";
import { noContentSchema, notificationParamsSchema } from "@openbts/shared/contract";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { accountOwnerId } from "../../../../features/notifications/owner.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a notification",
  description:
    "Deletes one of your notifications. You get 204 even when the notification does not exist or is not yours, " +
    "so it is safe to repeat the request.",
  params: notificationParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  401: "You are not signed in, or the token you sent is invalid. API keys are not accepted here, so use a session or an OAuth token.",
  403:
    "The OAuth token does not have the `profile` scope. " +
    "Also returned when two-factor authentication still has to be set up or the endpoint is disabled.",
  404: null,
};
type ReqParams = { Params: z.infer<typeof notificationParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const userId = accountOwnerId(req);

  await db.delete(notifications).where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)));

  return res.status(204).send();
}

const deleteNotification: Route<ReqParams, void> = {
  url: "/notifications/:id",
  method: "DELETE",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default deleteNotification;
