import { NotificationType, notifications, operators, stations, ukeStations } from "@openbts/drizzle";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { notificationTitle } from "../../../../features/notifications/service.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const operatorSchema = z.object({ name: z.string(), mnc: z.number().nullable() });

const stationSchema = z.object({
  id: z.number().nullable(),
  station_id: z.string().nullable(),
  source: z.enum(["internal", "uke"]),
  operator: operatorSchema.nullable(),
});

const changesSchema = z.object({
  cells: z.object({ added: z.number(), removed: z.number(), updated: z.number() }).optional(),
  permits: z.object({ added: z.number(), deleted: z.number() }).optional(),
  ukeStationsAdded: z.number().optional(),
  removedFromUke: z.boolean().optional(),
});

const notificationSchema = z.object({
  id: z.string(),
  type: z.enum(NotificationType.enumValues),
  title: z.string(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  actionUrl: z.string().nullable(),
  station: stationSchema.nullable(),
  submission: z.object({ id: z.string(), type: z.enum(["new", "update", "delete"]).nullable() }).nullable(),
  actor: z.object({ name: z.string(), username: z.string().nullable() }).nullable(),
  note: z.string().nullable(),
  changes: changesSchema.nullable(),
  count: z.number(),
});

const schemaRoute = {
  querystring: z.object({
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  }),
  response: {
    200: z.object({
      data: z.array(notificationSchema),
      totalUnread: z.number(),
      totalCount: z.number(),
    }),
  },
};

type ReqQuery = { Querystring: { limit: number; offset: number } };
type NotificationRow = typeof notifications.$inferSelect;
type NotificationItem = z.infer<typeof notificationSchema>;
type ResponseData = { data: NotificationItem[]; totalUnread: number; totalCount: number };
type StationDetails = { stationId: string; operator: z.infer<typeof operatorSchema> };
type ActorUser = { name: string; username: string | null };
type SubmissionActors = { submitter: ActorUser | null; reviewer: ActorUser | null };
type Metadata = Record<string, unknown>;

const notificationsQuery = db.query.notifications
  .findMany({
    where: { userId: sql.placeholder("userId") },
    orderBy: { updatedAt: "desc", createdAt: "desc" },
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

function metadataRecord(metadata: NotificationRow["metadata"]): Metadata {
  if (metadata !== null && typeof metadata === "object" && !Array.isArray(metadata)) return metadata;
  return {};
}

function metadataString(metadata: Metadata, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadataNumber(metadata: Metadata, key: string): number {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stationKey(row: NotificationRow): string | null {
  if (row.stationId !== null) return `internal:${row.stationId}`;
  if (row.ukeStationId !== null) return `uke:${row.ukeStationId}`;
  return null;
}

async function loadStationDetails(rows: NotificationRow[]): Promise<Map<string, StationDetails>> {
  const stationIds = [...new Set(rows.flatMap((row) => (row.stationId === null ? [] : [row.stationId])))];
  const ukeStationIds = [...new Set(rows.flatMap((row) => (row.ukeStationId === null ? [] : [row.ukeStationId])))];

  const [stationRows, ukeStationRows] = await Promise.all([
    stationIds.length > 0
      ? db
          .select({ id: stations.id, stationId: stations.station_id, name: operators.name, mnc: operators.mnc })
          .from(stations)
          .innerJoin(operators, eq(stations.operator_id, operators.id))
          .where(inArray(stations.id, stationIds))
      : Promise.resolve([]),
    ukeStationIds.length > 0
      ? db
          .select({ id: ukeStations.id, stationId: ukeStations.station_id, name: operators.name, mnc: operators.mnc })
          .from(ukeStations)
          .innerJoin(operators, eq(ukeStations.operator_id, operators.id))
          .where(inArray(ukeStations.id, ukeStationIds))
      : Promise.resolve([]),
  ]);

  return new Map([
    ...stationRows.map(({ id, stationId, name, mnc }) => [`internal:${id}`, { stationId, operator: { name, mnc } }] as const),
    ...ukeStationRows.map(({ id, stationId, name, mnc }) => [`uke:${id}`, { stationId, operator: { name, mnc } }] as const),
  ]);
}

async function loadSubmissionActors(rows: NotificationRow[]): Promise<Map<string, SubmissionActors>> {
  const submissionIds = [...new Set(rows.flatMap((row) => (row.submissionId === null ? [] : [row.submissionId])))];
  if (submissionIds.length === 0) return new Map();

  const submissionRows = await db.query.submissions.findMany({
    where: { id: { in: submissionIds } },
    columns: { id: true },
    with: {
      submitter: { columns: { name: true, username: true } },
      reviewer: { columns: { name: true, username: true } },
    },
  });

  return new Map(submissionRows.map(({ id, submitter, reviewer }) => [id, { submitter, reviewer }] as const));
}

function toStation(row: NotificationRow, metadata: Metadata, details: StationDetails | undefined): NotificationItem["station"] {
  const id = row.stationId ?? row.ukeStationId;
  const stationId = details?.stationId ?? metadataString(metadata, "station_id");
  const operatorName = details?.operator.name ?? metadataString(metadata, "station_operator_name");
  if (id === null && stationId === null && operatorName === null) return null;

  const storedMnc = metadata.station_operator_mnc;
  return {
    id,
    station_id: stationId,
    source: row.stationId === null && (row.ukeStationId !== null || row.type === "station_uke_permit_added") ? "uke" : "internal",
    operator: operatorName === null ? null : { name: operatorName, mnc: details?.operator.mnc ?? (typeof storedMnc === "number" ? storedMnc : null) },
  };
}

function toSubmission(row: NotificationRow, metadata: Metadata): NotificationItem["submission"] {
  if (row.submissionId === null) return null;
  const type = metadata.submission_type;
  return { id: row.submissionId, type: type === "new" || type === "update" || type === "delete" ? type : null };
}

function toActor(row: NotificationRow, metadata: Metadata, actors: SubmissionActors | undefined): NotificationItem["actor"] {
  const isNewSubmission = row.type === "new_submission";
  if (!isNewSubmission && row.type !== "submission_approved" && row.type !== "submission_rejected") return null;

  const user = isNewSubmission ? actors?.submitter : actors?.reviewer;
  const name = user?.name || user?.username || metadataString(metadata, isNewSubmission ? "submitter_name" : "reviewer_name");
  return name ? { name, username: user?.username ?? null } : null;
}

function toChanges(row: NotificationRow, metadata: Metadata): NotificationItem["changes"] {
  if (row.type === "station_cells_changed")
    return {
      cells: { added: metadataNumber(metadata, "added"), removed: metadataNumber(metadata, "removed"), updated: metadataNumber(metadata, "updated") },
    };
  if (row.type === "station_uke_permit_added")
    return {
      permits: { added: metadataNumber(metadata, "permits_added"), deleted: metadataNumber(metadata, "permits_deleted") },
      ukeStationsAdded: metadataNumber(metadata, "uke_stations_added"),
      removedFromUke: metadata.uke_station_deleted === true,
    };
  return null;
}

function toNotificationItem(
  row: NotificationRow,
  stationDetails: Map<string, StationDetails>,
  submissionActors: Map<string, SubmissionActors>,
  locale: string | undefined,
): NotificationItem {
  const metadata = metadataRecord(row.metadata);
  const key = stationKey(row);

  return {
    id: row.id,
    type: row.type,
    title: notificationTitle(row.type, locale),
    readAt: row.readAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    actionUrl: row.type === "new_submission" && row.submissionId !== null ? `/admin/submissions/${row.submissionId}` : row.actionUrl,
    station: toStation(row, metadata, key === null ? undefined : stationDetails.get(key)),
    submission: toSubmission(row, metadata),
    actor: toActor(row, metadata, row.submissionId === null ? undefined : submissionActors.get(row.submissionId)),
    note: metadataString(metadata, "reviewer_note"),
    changes: toChanges(row, metadata),
    count: Math.max(1, metadataNumber(metadata, "count")),
  };
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const { limit, offset } = req.query;
  const userId = session.user.id;
  const locale = Reflect.get(session.user, "locale");

  const [rows, [totalRow], [unreadRow]] = await Promise.all([
    notificationsQuery.execute({ userId, limit, offset }),
    notificationsTotalQuery.execute({ userId }),
    notificationsUnreadQuery.execute({ userId }),
  ]);
  const [stationDetails, submissionActors] = await Promise.all([loadStationDetails(rows), loadSubmissionActors(rows)]);

  return res.send({
    data: rows.map((row) => toNotificationItem(row, stationDetails, submissionActors, typeof locale === "string" ? locale : undefined)),
    totalCount: totalRow?.total ?? 0,
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
