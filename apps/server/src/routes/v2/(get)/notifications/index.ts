import { notifications } from "@openbts/drizzle";
import { notificationListQuerySchema, notificationListSchema } from "@openbts/shared/contract";
import type { NotificationList, NotificationListQuery, Paging } from "@openbts/shared/contract";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { accountOwnerId } from "../../../../features/notifications/owner.js";
import { serializeNotifications } from "../../../../features/notifications/read.js";
import { loadUserRefViewer } from "../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createKeyset } from "../../../../lib/keyset.js";

const SORT = "-updatedAt";
const SORT_COLUMNS = { updatedAt: { column: notifications.updatedAt, kind: "instant" } } as const;

const cursorIdSchema = z.uuid();
const schemaRoute = {
  summary: "List notifications",
  description:
    "The most recently updated notifications come first. " +
    "Repeated events of the same type about the same station are merged into one notification for as long as it is unread. " +
    "Its `count` goes up and it moves back to the top of the list.",
  querystring: notificationListQuerySchema,
  response: {
    200: notificationListSchema,
  },
};
const errorReasons = {
  401: "API keys are not accepted here.",
  403: "The OAuth token does not have the `profile` scope.",
};
type ReqQuery = { Querystring: NotificationListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<NotificationList>>) {
  const userId = accountOwnerId(req);
  const { isRead, limit, cursor, includeTotal } = req.query;

  const filters = and(
    eq(notifications.userId, userId),
    isRead === true ? isNotNull(notifications.readAt) : undefined,
    isRead === false ? isNull(notifications.readAt) : undefined,
  );
  const keyset = createKeyset(SORT, notifications.id, SORT_COLUMNS, cursor, cursorIdSchema);

  const [rows, totals, viewer] = await Promise.all([
    db
      .select({ notification: notifications, key: keyset.key })
      .from(notifications)
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1),
    includeTotal ? db.select({ total: count() }).from(notifications).where(filters) : null,
    loadUserRefViewer(req),
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = {
    limit,
    nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.notification.id, key: last.key }) : null,
  };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({
    data: await serializeNotifications(
      page.map((row) => row.notification),
      viewer,
    ),
    paging,
  });
}

const getNotifications: Route<ReqQuery, NotificationList> = {
  url: "/notifications",
  method: "GET",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default getNotifications;
