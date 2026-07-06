import { notifications, operators, pushSubscriptions, stations, ukeStations, users } from "@openbts/drizzle";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import webpush from "web-push";

import db from "../database/psql.js";
import { getLabels, t } from "../i18n/index.js";
import { logger } from "../utils/logger.js";
import { coalesceOrCreateStationNotification } from "../utils/notifications/coalesceOrCreateStationNotification.js";
import { getStationWatchers } from "../utils/notifications/getStationWatchers.js";
import { getUkeStationWatchers } from "../utils/notifications/getUkeStationWatchers.js";

const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;

if (VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export type StationNotificationType = "station_cells_changed" | "station_photos_added" | "station_comment_approved" | "station_uke_permit_added";
export type NotificationType = "submission_approved" | "submission_rejected" | "new_submission" | StationNotificationType;

const STATION_NOTIFICATION_TYPES: StationNotificationType[] = [
  "station_cells_changed",
  "station_photos_added",
  "station_comment_approved",
  "station_uke_permit_added",
];

const NOTIFICATION_TYPE_KEY: Record<
  NotificationType,
  | "submissionApproved"
  | "submissionRejected"
  | "newSubmission"
  | "stationCellsChanged"
  | "stationPhotosAdded"
  | "stationCommentApproved"
  | "stationUkePermitAdded"
> = {
  submission_approved: "submissionApproved",
  submission_rejected: "submissionRejected",
  new_submission: "newSubmission",
  station_cells_changed: "stationCellsChanged",
  station_photos_added: "stationPhotosAdded",
  station_comment_approved: "stationCommentApproved",
  station_uke_permit_added: "stationUkePermitAdded",
};

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  submissionId?: string;
  stationId?: number;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
}

export async function createAndDeliverNotification(params: CreateNotificationParams): Promise<void> {
  const { userId, type, submissionId, stationId, metadata, actionUrl } = params;

  const [user, stationOperatorName] = await Promise.all([
    db.query.users.findFirst({ where: { id: userId }, columns: { locale: true } }),
    stationId !== undefined ? getStationOperatorName(stationId) : Promise.resolve(undefined),
  ]);
  const strings = t(NOTIFICATION_TYPE_KEY[type], user?.locale);
  const title = strings.title;
  const enrichedMetadata =
    stationOperatorName !== undefined
      ? {
          ...metadata,
          station_operator_name: stationOperatorName,
        }
      : metadata;

  const [inserted] = await db
    .insert(notifications)
    .values({
      userId,
      type,
      title,
      submissionId: submissionId ?? null,
      stationId: stationId ?? null,
      metadata: enrichedMetadata ?? null,
      actionUrl: actionUrl ?? null,
    })
    .returning({ id: notifications.id });

  const allSubs = await db.query.pushSubscriptions.findMany({ where: { userId } });
  const pushSubs =
    type === "submission_approved" || type === "submission_rejected" ? allSubs.filter((s) => s.preferences.submissionUpdates !== false) : allSubs;

  const body = buildPushBody(strings.body, enrichedMetadata, user?.locale);
  const payload = JSON.stringify({ title, body, actionUrl, notificationId: inserted?.id });

  await deliverPush(pushSubs, payload);
}

async function deliverPush(subs: { endpoint: string; p256dh: string; auth: string }[], payload: string): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return true;
  if (subs.length === 0) return true;

  let anySucceeded = false;
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        anySucceeded = true;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
          anySucceeded = true;
        } else {
          logger.warn("Failed to deliver push notification", { endpoint: sub.endpoint, status });
        }
      }
    }),
  );
  return anySucceeded;
}

function buildPushBody(baseBody: string, metadata: Record<string, unknown> | undefined, locale: string | null | undefined): string {
  const labels = getLabels(locale);
  const lines = [baseBody];
  const {
    submitter_name,
    station_id,
    station_operator_name,
    reviewer_note,
    reviewer_name,
    added,
    removed,
    updated,
    permits_added,
    permits_updated,
    uke_stations_added,
    count,
  } = metadata ?? {};
  if (typeof submitter_name === "string") lines.push(`${labels.submittedBy} ${submitter_name}`);
  if (typeof station_id === "string") {
    const stationLabel = typeof station_operator_name === "string" ? `${station_id} (${station_operator_name})` : station_id;
    lines.push(`${labels.station}: ${stationLabel}`);
  }
  if (typeof reviewer_name === "string") lines.push(`${labels.reviewerName}: ${reviewer_name}`);
  if (typeof reviewer_note === "string") lines.push(`${labels.reviewerNote}: ${reviewer_note}`);
  if (typeof added === "number" && added > 0) lines.push(`${labels.cellsAdded}: ${added}`);
  if (typeof removed === "number" && removed > 0) lines.push(`${labels.cellsRemoved}: ${removed}`);
  if (typeof updated === "number" && updated > 0) lines.push(`${labels.cellsUpdated}: ${updated}`);
  if (typeof permits_added === "number" && permits_added > 0) lines.push(`${labels.permitsAdded}: ${permits_added}`);
  if (typeof permits_updated === "number" && permits_updated > 0) lines.push(`${labels.permitsUpdated}: ${permits_updated}`);
  if (typeof uke_stations_added === "number" && uke_stations_added > 0) lines.push(`${labels.ukeStationsAdded}: ${uke_stations_added}`);
  if (typeof count === "number" && count > 1) lines.push(`${labels.count}: ${count}`);
  return lines.join("\n");
}

async function getStationOperatorName(stationId: number): Promise<string | undefined> {
  const [station] = await db
    .select({ operatorName: operators.name })
    .from(stations)
    .innerJoin(operators, eq(stations.operator_id, operators.id))
    .where(eq(stations.id, stationId))
    .limit(1);
  return station?.operatorName;
}

async function getUkeStationOperatorName(ukeStationId: number): Promise<string | undefined> {
  const [station] = await db
    .select({ operatorName: operators.name })
    .from(ukeStations)
    .innerJoin(operators, eq(ukeStations.operator_id, operators.id))
    .where(eq(ukeStations.id, ukeStationId))
    .limit(1);
  return station?.operatorName;
}

async function notifyWatchers(params: {
  watcherIds: string[];
  stationId?: number;
  ukeStationId?: number;
  stationOperatorName: string | undefined;
  stationStringId?: string | null;
  type: StationNotificationType;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
}): Promise<void> {
  const localeRows = await db.select({ id: users.id, locale: users.locale }).from(users).where(inArray(users.id, params.watcherIds));
  const localeByUser = new Map(localeRows.map((u) => [u.id, u.locale]));

  await Promise.allSettled(
    params.watcherIds.map(async (userId) => {
      const strings = t(NOTIFICATION_TYPE_KEY[params.type], localeByUser.get(userId));
      await coalesceOrCreateStationNotification({
        userId,
        stationId: params.stationId,
        ukeStationId: params.ukeStationId,
        type: params.type,
        title: strings.title,
        metadata: {
          ...(params.stationStringId ? { station_id: params.stationStringId } : {}),
          ...(params.stationOperatorName ? { station_operator_name: params.stationOperatorName } : {}),
          ...params.metadata,
        },
        actionUrl: params.actionUrl,
      });
    }),
  );
}

export async function notifyStationWatchers(params: {
  stationId: number;
  stationStringId?: string | null;
  type: StationNotificationType;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
}): Promise<void> {
  const [watcherIds, stationOperatorName] = await Promise.all([getStationWatchers(params.stationId), getStationOperatorName(params.stationId)]);
  if (watcherIds.length === 0) return;
  await notifyWatchers({ ...params, watcherIds, stationOperatorName });
}

export async function notifyUkeStationWatchers(params: {
  ukeStationId: number;
  stationStringId?: string | null;
  type: StationNotificationType;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
}): Promise<void> {
  const [watcherIds, stationOperatorName] = await Promise.all([
    getUkeStationWatchers(params.ukeStationId),
    getUkeStationOperatorName(params.ukeStationId),
  ]);
  if (watcherIds.length === 0) return;
  await notifyWatchers({ ...params, watcherIds, stationOperatorName });
}

export async function deliverQueuedStationWatchNotifications(limit = 100): Promise<number> {
  const queued = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      title: notifications.title,
      metadata: notifications.metadata,
      actionUrl: notifications.actionUrl,
      locale: users.locale,
    })
    .from(notifications)
    .innerJoin(users, eq(notifications.userId, users.id))
    .where(
      and(
        inArray(notifications.type, STATION_NOTIFICATION_TYPES),
        isNull(notifications.readAt),
        sql`${notifications.pushQueuedAt} IS NOT NULL`,
        isNull(notifications.pushSentAt),
      ),
    )
    .orderBy(asc(notifications.pushQueuedAt))
    .limit(limit);
  if (queued.length === 0) return 0;

  const userIds = [...new Set(queued.map((notification) => notification.userId))];
  const allSubs = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      userId: pushSubscriptions.userId,
    })
    .from(pushSubscriptions)
    .where(and(inArray(pushSubscriptions.userId, userIds), sql`(${pushSubscriptions.preferences}->>'stationWatches') IS DISTINCT FROM 'false'`));

  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const sub of allSubs) {
    const existing = subsByUser.get(sub.userId) ?? [];
    existing.push({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
    subsByUser.set(sub.userId, existing);
  }

  const results = await Promise.allSettled(
    queued.map(async (notification) => {
      const userSubs = subsByUser.get(notification.userId) ?? [];
      const strings = t(NOTIFICATION_TYPE_KEY[notification.type], notification.locale);
      const body = buildPushBody(strings.body, notification.metadata ?? undefined, notification.locale);
      const payload = JSON.stringify({
        title: notification.title,
        body,
        actionUrl: notification.actionUrl,
        notificationId: notification.id,
      });
      const delivered = await deliverPush(userSubs, payload);
      return { id: notification.id, delivered };
    }),
  );

  const sentIds = results
    .filter((r): r is PromiseFulfilledResult<{ id: string; delivered: boolean }> => r.status === "fulfilled" && r.value.delivered)
    .map((r) => r.value.id);

  if (sentIds.length > 0) {
    await db.update(notifications).set({ pushSentAt: new Date(), updatedAt: new Date() }).where(inArray(notifications.id, sentIds));
  }

  return queued.length;
}

export async function notifyUkeUpdate(): Promise<void> {
  const subs = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      locale: users.locale,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .where(sql`(${pushSubscriptions.preferences}->>'ukeUpdates')::boolean = true`);
  if (subs.length === 0) return;

  await Promise.allSettled(
    subs.map((sub) => {
      const strings = t("ukeUpdate", sub.locale);
      const payload = JSON.stringify({ title: strings.title, body: strings.body, actionUrl: "/" });
      return deliverPush([sub], payload);
    }),
  );
}

const STAFF_ROLES = ["admin", "editor"];

export async function notifyStaffNewSubmission(params: {
  submissionId: string;
  submitterName: string;
  submissionType: string;
  stationId?: string;
}): Promise<void> {
  const staffUsers = await db.select({ id: users.id, locale: users.locale }).from(users).where(inArray(users.role, STAFF_ROLES));
  if (staffUsers.length === 0) return;

  const metadata: Record<string, unknown> = {
    submitter_name: params.submitterName,
    submission_type: params.submissionType,
    ...(params.stationId ? { station_id: params.stationId } : {}),
  };
  const actionUrl = `/admin/submissions/${params.submissionId}`;

  const insertedNotifications = await db
    .insert(notifications)
    .values(
      staffUsers.map((u) => ({
        userId: u.id,
        type: "new_submission" as const,
        title: t("newSubmission", u.locale).title,
        submissionId: params.submissionId,
        metadata,
        actionUrl,
      })),
    )
    .returning({ id: notifications.id, userId: notifications.userId });

  const staffIds = staffUsers.map((u) => u.id);
  const localeByUser = new Map(staffUsers.map((u) => [u.id, u.locale]));
  const allSubs = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      userId: pushSubscriptions.userId,
    })
    .from(pushSubscriptions)
    .where(and(inArray(pushSubscriptions.userId, staffIds), sql`(${pushSubscriptions.preferences}->>'newSubmission') IS DISTINCT FROM 'false'`));

  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const sub of allSubs) {
    const existing = subsByUser.get(sub.userId) ?? [];
    existing.push({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
    subsByUser.set(sub.userId, existing);
  }

  await Promise.allSettled(
    insertedNotifications.map((notif) => {
      const userSubs = subsByUser.get(notif.userId) ?? [];
      const locale = localeByUser.get(notif.userId);
      const strings = t("newSubmission", locale);
      const body = buildPushBody(strings.body, metadata, locale);
      return deliverPush(userSubs, JSON.stringify({ title: strings.title, body, actionUrl, notificationId: notif.id }));
    }),
  );
}
