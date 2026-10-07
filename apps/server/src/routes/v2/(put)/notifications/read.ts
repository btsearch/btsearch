import { notifications } from "@openbts/drizzle";
import { noContentSchema, notificationsReadQuerySchema } from "@openbts/shared/contract";
import type { NotificationsReadQuery } from "@openbts/shared/contract";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import db from "../../../../database/psql.js";
import { accountOwnerId } from "../../../../features/notifications/owner.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Mark all notifications as read",
  description:
    "Marks all your unread notifications as read. " +
    "With `updatedBefore`, only notifications last updated at or before that time are marked. Send the time you loaded the list, " +
    "so that notifications that arrived or changed after that stay unread.",
  querystring: notificationsReadQuerySchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  401: "You are not signed in, or the token you sent is invalid. API keys are not accepted here, so use a session or an OAuth token.",
  403:
    "The OAuth token does not have the `profile` scope. " +
    "Also returned when two-factor authentication still has to be set up or the endpoint is disabled.",
};
type ReqQuery = { Querystring: NotificationsReadQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<EmptyResponse>) {
  const userId = accountOwnerId(req);
  const { updatedBefore } = req.query;

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        updatedBefore === undefined ? undefined : sql`date_trunc('milliseconds', ${notifications.updatedAt}) <= ${updatedBefore}::timestamptz`,
      ),
    );

  return res.status(204).send();
}

const markNotificationsRead: Route<ReqQuery, void> = {
  url: "/notifications/read",
  method: "PUT",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default markNotificationsRead;
