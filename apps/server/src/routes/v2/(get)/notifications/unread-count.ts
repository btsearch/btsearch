import { notifications } from "@openbts/drizzle";
import { unreadNotificationsSchema } from "@openbts/shared/contract";
import type { UnreadNotifications } from "@openbts/shared/contract";
import { and, count, eq, isNull } from "drizzle-orm";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { accountOwnerId } from "../../../../features/notifications/owner.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Count unread notifications",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: unreadNotificationsSchema,
    }),
  },
};
const errorReasons = {
  401: "You are not signed in, or the token you sent is invalid. API keys are not accepted here, so use a session or an OAuth token.",
  403:
    "The OAuth token does not have the `profile` scope. " +
    "Also returned when two-factor authentication still has to be set up or the endpoint is disabled.",
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<UnreadNotifications>>) {
  const userId = accountOwnerId(req);

  const [unread] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return res.send({ data: { count: unread?.count ?? 0 } });
}

const getUnreadNotifications: Route<RouteGenericInterface, UnreadNotifications> = {
  url: "/notifications/unread-count",
  method: "GET",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default getUnreadNotifications;
