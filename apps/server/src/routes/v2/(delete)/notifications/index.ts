import { notifications } from "@openbts/drizzle";
import { noContentSchema } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { accountOwnerId } from "../../../../features/notifications/owner.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete all notifications",
  description:
    "Deletes all your notifications, read and unread. This cannot be undone. " +
    "There are no filters. A request with any query parameter is rejected with 400, so an unsupported filter cannot end up deleting everything.",
  querystring: z.object({}).strict(),
  response: { 204: noContentSchema },
};
const errorReasons = {
  401: "You are not signed in, or the token you sent is invalid. API keys are not accepted here, so use a session or an OAuth token.",
  403:
    "The OAuth token does not have the `profile` scope. " +
    "Also returned when two-factor authentication still has to be set up or the endpoint is disabled.",
};

async function handler(req: FastifyRequest, res: ReplyPayload<EmptyResponse>) {
  const userId = accountOwnerId(req);

  await db.delete(notifications).where(eq(notifications.userId, userId));

  return res.status(204).send();
}

const deleteNotifications: Route<RouteGenericInterface, void> = {
  url: "/notifications",
  method: "DELETE",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default deleteNotifications;
