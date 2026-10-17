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
  description: "You get 204 even when the notification does not exist or is not yours, so it is safe to repeat the request.",
  params: notificationParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  401: "API keys are not accepted here.",
  403: "The OAuth token does not have the `profile` scope.",
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
