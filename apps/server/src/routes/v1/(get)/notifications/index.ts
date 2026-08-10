import { notifications, operators, stations, ukeStations } from "@openbts/drizzle";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const notificationSchema = createSelectSchema(notifications);

const schemaRoute = {
  querystring: z.object({
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  }),
  response: {
    200: z.object({
      data: z.array(notificationSchema),
      totalUnread: z.number(),
      total: z.number(),
    }),
  },
};

type ReqQuery = { Querystring: { limit: number; offset: number } };
type NotificationRow = z.infer<typeof notificationSchema>;
type ResponseData = { data: NotificationRow[]; totalUnread: number; total: number };

const notificationsQuery = db.query.notifications
  .findMany({
    where: { userId: sql.placeholder("userId") },
    orderBy: { createdAt: "desc" },
    limit: sql.placeholder("limit"),
    offset: sql.placeholder("offset"),
  })
  .prepare("notifications_by_user");

const notificationsTotalQuery = db
  .select({ total: count() })
  .from(notifications)
  .where(eq(notifications.userId, sql.placeholder("userId")))
  .prepare("notifications_total");

const notificationsUnreadQuery = db
  .select({ total: count() })
  .from(notifications)
  .where(and(eq(notifications.userId, sql.placeholder("userId")), isNull(notifications.readAt)))
  .prepare("notifications_unread");

function metadataRecord(metadata: NotificationRow["metadata"]): Record<string, unknown> {
  if (metadata !== null && typeof metadata === "object" && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  return {};
}

async function loadStationOperatorNames(rows: NotificationRow[]): Promise<Map<string, string>> {
  const needsLookup = (row: NotificationRow) => typeof metadataRecord(row.metadata).station_operator_name !== "string";
  const stationIds = [...new Set(rows.filter((r) => r.stationId !== null && needsLookup(r)).map((r) => r.stationId as number))];
  const ukeStationIds = [...new Set(rows.filter((r) => r.ukeStationId !== null && needsLookup(r)).map((r) => r.ukeStationId as number))];

  const [stationRows, ukeStationRows] = await Promise.all([
    stationIds.length > 0
      ? db
          .select({ stationId: stations.id, operatorName: operators.name })
          .from(stations)
          .innerJoin(operators, eq(stations.operator_id, operators.id))
          .where(inArray(stations.id, stationIds))
      : Promise.resolve([]),
    ukeStationIds.length > 0
      ? db
          .select({ stationId: ukeStations.id, operatorName: operators.name })
          .from(ukeStations)
          .innerJoin(operators, eq(ukeStations.operator_id, operators.id))
          .where(inArray(ukeStations.id, ukeStationIds))
      : Promise.resolve([]),
  ]);

  return new Map([
    ...stationRows.map((row) => [`internal:${row.stationId}`, row.operatorName] as const),
    ...ukeStationRows.map((row) => [`uke:${row.stationId}`, row.operatorName] as const),
  ]);
}

async function enrichNotificationMetadata(rows: NotificationRow[]): Promise<NotificationRow[]> {
  const operatorNames = await loadStationOperatorNames(rows);

  return rows.map((row) => {
    const operatorName =
      row.stationId !== null
        ? operatorNames.get(`internal:${row.stationId as number}`)
        : row.ukeStationId !== null
          ? operatorNames.get(`uke:${row.ukeStationId as number}`)
          : undefined;
    const actionUrl = row.type === "new_submission" && row.submissionId !== null ? `/admin/submissions/${row.submissionId as number}` : row.actionUrl;
    if (operatorName === undefined && actionUrl === row.actionUrl) return row;
    return {
      ...row,
      actionUrl,
      metadata: {
        ...metadataRecord(row.metadata),
        ...(operatorName !== undefined ? { station_operator_name: operatorName } : {}),
      },
    };
  });
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const { limit, offset } = req.query;
  const userId = session.user.id;

  const [rows, [totalRow], [unreadRow]] = await Promise.all([
    notificationsQuery.execute({ userId, limit, offset }),
    notificationsTotalQuery.execute({ userId }),
    notificationsUnreadQuery.execute({ userId }),
  ]);
  const data = await enrichNotificationMetadata(rows);

  return res.send({
    data,
    total: totalRow?.total ?? 0,
    totalUnread: unreadRow?.total ?? 0,
  });
}

const getNotifications: Route<ReqQuery, ResponseData> = {
  url: "/notifications",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getNotifications;
