import { notifications, officialSites, operators, pushSubscriptions, stations, users } from "@openbts/drizzle";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import webpush from "web-push";

import db from "../../database/psql.js";
import { getLabels, t } from "../../i18n/index.js";
import { unique } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";
import { logger } from "../../utils/logger.js";
import { coversTarget, loadStaffAccess } from "../access/access.js";
import { resolveScopeTargets } from "../access/scope.js";
import { type StationLabel, stationLabelMetadata } from "../submissions/stationLabels.js";
import { coalesceOrCreateStationNotification } from "./coalesceOrCreateStationNotification.js";
import { NON_PUBLIC_PUSH_ADDRESS, resolvePublicPushEndpoint, sendPushRequest } from "./publicPushEndpoint.js";
import { getOfficialSitesWatchers, getStationWatchers, getStationsWatchers } from "./watchers.js";

const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;

if (VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export type StationNotificationType = "station_cells_changed" | "station_photos_added" | "station_comment_approved" | "station_official_permit_added";
export type NotificationType =
  | "submission_approved"
  | "submission_rejected"
  | "submission_photo_upload_failed"
  | "new_submission"
  | StationNotificationType;

const STATION_NOTIFICATION_TYPES: StationNotificationType[] = [
  "station_cells_changed",
  "station_photos_added",
  "station_comment_approved",
  "station_official_permit_added",
];
const SUBMISSION_UPDATE_NOTIFICATION_TYPES = new Set<NotificationType>([
  "submission_approved",
  "submission_rejected",
  "submission_photo_upload_failed",
]);
const SUBMISSION_APPROVAL_PUSH_WINDOW_MS = 10 * 60 * 1000;

const NOTIFICATION_TYPE_KEY: Record<
  NotificationType,
  | "submissionApproved"
  | "submissionRejected"
  | "submissionPhotoUploadFailed"
  | "newSubmission"
  | "stationCellsChanged"
  | "stationPhotosAdded"
  | "stationCommentApproved"
  | "stationOfficialPermitAdded"
> = {
  submission_approved: "submissionApproved",
  submission_rejected: "submissionRejected",
  submission_photo_upload_failed: "submissionPhotoUploadFailed",
  new_submission: "newSubmission",
  station_cells_changed: "stationCellsChanged",
  station_photos_added: "stationPhotosAdded",
  station_comment_approved: "stationCommentApproved",
  station_official_permit_added: "stationOfficialPermitAdded",
};

export function notificationTitle(type: NotificationType, locale: string | null | undefined): string {
  return t(NOTIFICATION_TYPE_KEY[type], locale).title;
}

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  submissionId?: string;
  stationId?: number;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
}

export interface PreparedNotification {
  title: string;
  body: string;
  locale: string | null | undefined;
  metadata: Record<string, unknown> | undefined;
}

export async function prepareNotification(params: CreateNotificationParams): Promise<PreparedNotification> {
  const { userId, type, stationId, metadata } = params;

  const [user, stationOperator] = await Promise.all([
    db.query.users.findFirst({ where: { id: userId }, columns: { locale: true } }),
    stationId !== undefined ? getStationOperator(stationId) : Promise.resolve(undefined),
  ]);
  const strings = t(NOTIFICATION_TYPE_KEY[type], user?.locale);
  const title = strings.title;
  const enrichedMetadata = stationOperator !== undefined ? { ...metadata, ...stationLabelMetadata(stationOperator) } : metadata;

  return { title, body: strings.body, locale: user?.locale, metadata: enrichedMetadata };
}

async function insertNotification(
  executor: Pick<DbTx, "insert">,
  params: CreateNotificationParams,
  title: string,
  metadata: Record<string, unknown> | undefined,
  pushQueuedAt: Date | null = null,
): Promise<string> {
  const { userId, type, submissionId, stationId, actionUrl } = params;

  const [inserted] = await executor
    .insert(notifications)
    .values({
      userId,
      type,
      title,
      submissionId: submissionId ?? null,
      stationId: stationId ?? null,
      metadata: metadata ?? null,
      actionUrl: actionUrl ?? null,
      pushQueuedAt,
    })
    .returning({ id: notifications.id });

  if (!inserted) throw new Error("Failed to insert notification");
  return inserted.id;
}

export async function insertPreparedNotification(tx: DbTx, params: CreateNotificationParams, prepared: PreparedNotification): Promise<string> {
  return insertNotification(tx, params, prepared.title, prepared.metadata);
}

export async function deliverPreparedNotificationPush(
  params: CreateNotificationParams,
  prepared: PreparedNotification,
  notificationId: string,
): Promise<void> {
  const { userId, type, actionUrl } = params;
  const allSubs = await db.query.pushSubscriptions.findMany({ where: { userId } });
  const pushSubs = SUBMISSION_UPDATE_NOTIFICATION_TYPES.has(type)
    ? allSubs.filter((subscription) => subscription.preferences.submissionUpdates !== false)
    : allSubs;

  const body = buildPushBody(prepared.body, prepared.metadata, prepared.locale);
  const payload = JSON.stringify({ title: prepared.title, body, actionUrl, notificationId });

  await deliverPush(pushSubs, payload);
}

export async function createAndDeliverNotification(params: CreateNotificationParams): Promise<void> {
  const prepared = await prepareNotification(params);
  const notificationId = await insertNotification(db, params, prepared.title, prepared.metadata);
  await deliverPreparedNotificationPush(params, prepared, notificationId);
}

export async function createQueuedSubmissionApprovalNotification(params: Omit<CreateNotificationParams, "type">): Promise<void> {
  const approvalParams: CreateNotificationParams = { ...params, type: "submission_approved" };
  const prepared = await prepareNotification(approvalParams);
  await insertNotification(db, approvalParams, prepared.title, prepared.metadata, new Date());
}

async function deliverPush(subs: { endpoint: string; p256dh: string; auth: string }[], payload: string): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return true;
  if (subs.length === 0) return true;

  let anySucceeded = false;
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        const endpoint = await resolvePublicPushEndpoint(sub.endpoint);
        await sendPushRequest(webpush.generateRequestDetails({ endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload));
        anySucceeded = true;
      } catch (err: unknown) {
        const { statusCode: status, code } = err as { statusCode?: number; code?: string };
        if (status === 410 || status === 404 || code === NON_PUBLIC_PUSH_ADDRESS) {
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
    permits_deleted,
    official_sites_added,
    official_site_deleted,
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
  if (typeof permits_deleted === "number" && permits_deleted > 0) lines.push(`${labels.permitsDeleted}: ${permits_deleted}`);
  if (typeof official_sites_added === "number" && official_sites_added > 0) lines.push(`${labels.officialSitesAdded}: ${official_sites_added}`);
  if (official_site_deleted === true) lines.push(labels.officialSiteDeleted);
  if (typeof count === "number" && count > 1) lines.push(`${labels.count}: ${count}`);
  return lines.join("\n");
}

type StationOperator = { operatorName: string; operatorMnc: number | null };
type StationWatchNotification = {
  stationId: number;
  stationStringId?: string | null;
  type: StationNotificationType;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
};
type OfficialSiteWatchNotification = Omit<StationWatchNotification, "stationId"> & { officialSiteId: number; siteDeleted?: boolean };
type LocaleByUser = ReadonlyMap<string, string | null>;

async function getStationOperator(stationId: number): Promise<StationOperator | undefined> {
  const [station] = await db
    .select({ operatorName: operators.name, operatorMnc: operators.mnc })
    .from(stations)
    .innerJoin(operators, eq(stations.operator_id, operators.id))
    .where(eq(stations.id, stationId))
    .limit(1);
  return station;
}

async function getStationOperators(stationIds: readonly number[], reader: Pick<DbTx, "select">): Promise<Map<number, StationOperator>> {
  const operated = await reader
    .select({ stationId: stations.id, operatorName: operators.name, operatorMnc: operators.mnc })
    .from(stations)
    .innerJoin(operators, eq(stations.operator_id, operators.id))
    .where(inArray(stations.id, [...stationIds]));
  return new Map(operated.map(({ stationId, ...operator }) => [stationId, operator]));
}

async function getOfficialSiteOperators(siteIds: readonly number[], reader: Pick<DbTx, "select">): Promise<Map<number, StationOperator>> {
  const operated = await reader
    .select({ siteId: officialSites.id, operatorName: operators.name, operatorMnc: operators.mnc })
    .from(officialSites)
    .innerJoin(operators, eq(officialSites.operator_id, operators.id))
    .where(inArray(officialSites.id, [...siteIds]));
  return new Map(operated.map(({ siteId, ...operator }) => [siteId, operator]));
}

async function getLocaleByUser(userIds: readonly string[], reader: Pick<DbTx, "select">): Promise<LocaleByUser> {
  const localeRows = await reader
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(inArray(users.id, [...userIds]));
  return new Map(localeRows.map((u) => [u.id, u.locale]));
}

async function notifyWatchers(
  params: {
    watcherIds: string[];
    localeByUser: LocaleByUser;
    stationId?: number;
    officialSiteId?: number;
    stationOperator: StationOperator | undefined;
    stationStringId?: string | null;
    type: StationNotificationType;
    metadata?: Record<string, unknown>;
    actionUrl?: string;
    detached?: boolean;
  },
  tx?: DbTx,
): Promise<void> {
  const executor = tx ?? db;

  async function notifyWatcher(userId: string): Promise<void> {
    const strings = t(NOTIFICATION_TYPE_KEY[params.type], params.localeByUser.get(userId));
    await coalesceOrCreateStationNotification(
      {
        userId,
        stationId: params.stationId,
        officialSiteId: params.officialSiteId,
        detached: params.detached,
        type: params.type,
        title: strings.title,
        metadata: {
          ...stationLabelMetadata({ stationId: params.stationStringId, ...params.stationOperator }),
          ...params.metadata,
        },
        actionUrl: params.actionUrl,
      },
      executor,
    );
  }

  if (tx === undefined) {
    await Promise.allSettled(params.watcherIds.map(notifyWatcher));
    return;
  }
  // eslint-disable-next-line no-await-in-loop
  for (const userId of params.watcherIds) await notifyWatcher(userId);
}

export async function notifyStationWatchers(params: StationWatchNotification): Promise<void> {
  const [watcherIds, stationOperator] = await Promise.all([getStationWatchers(params.stationId), getStationOperator(params.stationId)]);
  if (watcherIds.length === 0) return;
  const localeByUser = await getLocaleByUser(watcherIds, db);
  await notifyWatchers({ ...params, watcherIds, localeByUser, stationOperator });
}

export async function notifyStationsWatchers(notifications: readonly StationWatchNotification[], tx: DbTx): Promise<void> {
  if (notifications.length === 0) return;

  const stationIds = notifications.map((notification) => notification.stationId);
  const [watchers, stationOperators] = await Promise.all([getStationsWatchers(stationIds, tx), getStationOperators(stationIds, tx)]);
  if (watchers.size === 0) return;

  const localeByUser = await getLocaleByUser(unique([...watchers.values()].flat()), tx);
  for (const params of notifications) {
    const watcherIds = watchers.get(params.stationId) ?? [];
    if (watcherIds.length === 0) continue;

    // eslint-disable-next-line no-await-in-loop
    await notifyWatchers({ ...params, watcherIds, localeByUser, stationOperator: stationOperators.get(params.stationId) }, tx);
  }
}

export async function notifyOfficialSitesWatchers(notifications: readonly OfficialSiteWatchNotification[], tx: DbTx): Promise<void> {
  if (notifications.length === 0) return;

  const siteIds = notifications.map((notification) => notification.officialSiteId);
  const [watchers, siteOperators] = await Promise.all([getOfficialSitesWatchers(siteIds, tx), getOfficialSiteOperators(siteIds, tx)]);
  if (watchers.size === 0) return;

  const localeByUser = await getLocaleByUser(unique([...watchers.values()].flat()), tx);
  for (const params of notifications) {
    const watcherIds = watchers.get(params.officialSiteId) ?? [];
    if (watcherIds.length === 0) continue;

    // eslint-disable-next-line no-await-in-loop
    await notifyWatchers(
      {
        ...params,
        officialSiteId: params.siteDeleted ? undefined : params.officialSiteId,
        detached: params.siteDeleted,
        watcherIds,
        localeByUser,
        stationOperator: siteOperators.get(params.officialSiteId),
      },
      tx,
    );
  }
}

export async function deliverQueuedStationWatchNotifications(limit = 100): Promise<number> {
  const queued = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
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
        title: strings.title,
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

  if (sentIds.length > 0) await db.update(notifications).set({ pushSentAt: new Date() }).where(inArray(notifications.id, sentIds));

  return queued.length;
}

export async function deliverQueuedSubmissionApprovalNotifications(limit = 100): Promise<number> {
  const cutoff = new Date(Date.now() - SUBMISSION_APPROVAL_PUSH_WINDOW_MS);
  const eligibleUsers = await db
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, "submission_approved"),
        isNull(notifications.readAt),
        isNull(notifications.pushSentAt),
        lte(notifications.pushQueuedAt, cutoff),
      ),
    )
    .groupBy(notifications.userId)
    .orderBy(asc(sql`min(${notifications.pushQueuedAt})`))
    .limit(limit);
  if (eligibleUsers.length === 0) return 0;

  const userIds = eligibleUsers.map(({ userId }) => userId);
  const queued = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      metadata: notifications.metadata,
      actionUrl: notifications.actionUrl,
      locale: users.locale,
    })
    .from(notifications)
    .innerJoin(users, eq(notifications.userId, users.id))
    .where(
      and(
        inArray(notifications.userId, userIds),
        eq(notifications.type, "submission_approved"),
        isNull(notifications.readAt),
        sql`${notifications.pushQueuedAt} IS NOT NULL`,
        isNull(notifications.pushSentAt),
      ),
    )
    .orderBy(asc(notifications.pushQueuedAt));

  type QueuedApproval = (typeof queued)[number];
  const queuedByUser = new Map<string, [QueuedApproval, ...QueuedApproval[]]>();
  for (const notification of queued) {
    const existing = queuedByUser.get(notification.userId);
    if (existing) existing.push(notification);
    else queuedByUser.set(notification.userId, [notification]);
  }
  if (queuedByUser.size === 0) return 0;

  const allSubs = await db.query.pushSubscriptions.findMany({ where: { userId: { in: [...queuedByUser.keys()] } } });
  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const sub of allSubs) {
    if (sub.preferences.submissionUpdates === false) continue;
    const existing = subsByUser.get(sub.userId) ?? [];
    existing.push({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
    subsByUser.set(sub.userId, existing);
  }

  const results = await Promise.allSettled(
    [...queuedByUser.entries()].map(async ([userId, userNotifications]) => {
      const first = userNotifications[0];
      const count = userNotifications.length;
      const strings = t(count > 1 ? "submissionApprovalsGrouped" : "submissionApproved", first.locale);
      const body =
        count > 1 ? strings.body.replace("{count}", count.toString()) : buildPushBody(strings.body, first.metadata ?? undefined, first.locale);
      const payload = JSON.stringify({
        title: strings.title,
        body,
        actionUrl: first.actionUrl,
        ...(count === 1 ? { notificationId: first.id } : {}),
      });
      const delivered = await deliverPush(subsByUser.get(userId) ?? [], payload);
      return { ids: userNotifications.map(({ id }) => id), delivered };
    }),
  );

  const sentIds = results.flatMap((result) => (result.status === "fulfilled" && result.value.delivered ? result.value.ids : []));
  if (sentIds.length > 0) await db.update(notifications).set({ pushSentAt: new Date() }).where(inArray(notifications.id, sentIds));

  return queuedByUser.size;
}

export async function notifyOfficialDataUpdate(sourceName: string): Promise<void> {
  const subs = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      locale: users.locale,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .where(sql`(${pushSubscriptions.preferences}->>'officialDataUpdates')::boolean = true`);
  if (subs.length === 0) return;

  await Promise.allSettled(
    subs.map((sub) => {
      const strings = t("officialDataUpdate", sub.locale);
      const payload = JSON.stringify({
        title: strings.title.replace("{source}", sourceName),
        body: strings.body.replace("{source}", sourceName),
        actionUrl: "/",
      });
      return deliverPush([sub], payload);
    }),
  );
}

export async function notifyStaffNewSubmission(params: {
  submissionId: string;
  submitterName: string;
  submissionType: string;
  station?: StationLabel;
}): Promise<void> {
  const [staff, targets] = await Promise.all([loadStaffAccess(), resolveScopeTargets({ submissionIds: [params.submissionId] })]);
  const recipientIds = staff
    .filter((access) => access.role === "admin" || targets.some((target) => coversTarget(access, target)))
    .map((access) => access.userId);
  if (recipientIds.length === 0) return;

  const staffUsers = await db.select({ id: users.id, locale: users.locale }).from(users).where(inArray(users.id, recipientIds));
  if (staffUsers.length === 0) return;

  const metadata: Record<string, unknown> = {
    submitter_name: params.submitterName,
    submission_type: params.submissionType,
    ...stationLabelMetadata(params.station),
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
