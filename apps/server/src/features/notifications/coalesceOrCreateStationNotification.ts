import { notifications } from "@openbts/drizzle";
import { type SQL, and, desc, eq, isNull } from "drizzle-orm";

import db from "../../database/psql.js";

type StationNotificationMetadata = Record<string, unknown>;
type StationNotificationType = "station_cells_changed" | "station_photos_added" | "station_comment_approved" | "station_uke_permit_added";

type CoalesceStationNotificationParams = {
  userId: string;
  stationId?: number;
  ukeStationId?: number;
  detached?: boolean;
  type: StationNotificationType;
  title: string;
  metadata?: StationNotificationMetadata;
  actionUrl?: string;
};

type CoalesceStationNotificationResult = {
  id: string;
  isNew: boolean;
};

const COALESCE_RETRIES = 1;

function numericMetadataValue(metadata: StationNotificationMetadata, key: string): number {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function mergeMetadata(
  current: StationNotificationMetadata | null,
  incoming: StationNotificationMetadata | undefined,
  type: StationNotificationType,
): StationNotificationMetadata {
  const merged = { ...current, ...incoming };

  if (type === "station_cells_changed") {
    merged.added = numericMetadataValue(current ?? {}, "added") + numericMetadataValue(incoming ?? {}, "added");
    merged.removed = numericMetadataValue(current ?? {}, "removed") + numericMetadataValue(incoming ?? {}, "removed");
    merged.updated = numericMetadataValue(current ?? {}, "updated") + numericMetadataValue(incoming ?? {}, "updated");
    return merged;
  }

  if (type === "station_uke_permit_added") {
    // legacy key
    const legacyPermitsUpdated = numericMetadataValue(current ?? {}, "permits_updated");
    delete merged.permits_updated;
    merged.permits_added = numericMetadataValue(current ?? {}, "permits_added") + numericMetadataValue(incoming ?? {}, "permits_added");
    merged.permits_deleted = numericMetadataValue(current ?? {}, "permits_deleted") + numericMetadataValue(incoming ?? {}, "permits_deleted");
    merged.uke_stations_added =
      numericMetadataValue(current ?? {}, "uke_stations_added") + numericMetadataValue(incoming ?? {}, "uke_stations_added");
    merged.count =
      Math.max(0, numericMetadataValue(current ?? {}, "count") - legacyPermitsUpdated) + Math.max(1, numericMetadataValue(incoming ?? {}, "count"));
    return merged;
  }

  merged.count = Math.max(1, numericMetadataValue(current ?? {}, "count")) + Math.max(1, numericMetadataValue(incoming ?? {}, "count"));
  return merged;
}

async function insertOrCoalesce(
  params: CoalesceStationNotificationParams,
  targetCondition: SQL,
  retries: number,
): Promise<CoalesceStationNotificationResult> {
  const { userId, stationId, ukeStationId, type, title, metadata, actionUrl } = params;
  const now = new Date();

  const [inserted] = await db
    .insert(notifications)
    .values({
      userId,
      stationId: stationId ?? null,
      ukeStationId: ukeStationId ?? null,
      type,
      title,
      metadata: metadata ?? null,
      actionUrl: actionUrl ?? null,
      pushQueuedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });

  if (inserted) return { id: inserted.id, isNew: true };

  const [existing] = await db
    .select({ id: notifications.id, metadata: notifications.metadata })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), targetCondition, eq(notifications.type, type), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(notifications)
      .set({
        metadata: mergeMetadata(existing.metadata, metadata, type),
        ...(actionUrl !== undefined ? { actionUrl } : {}),
        pushQueuedAt: now,
        pushSentAt: null,
        updatedAt: now,
      })
      .where(and(eq(notifications.id, existing.id), isNull(notifications.readAt)))
      .returning({ id: notifications.id });

    if (updated) return { id: updated.id, isNew: false };
  }

  if (retries > 0) return insertOrCoalesce(params, targetCondition, retries - 1);
  throw new Error("Failed to create station notification");
}

function stationTargetCondition({ stationId, ukeStationId }: CoalesceStationNotificationParams): SQL {
  if (stationId !== undefined) return eq(notifications.stationId, stationId);
  if (ukeStationId !== undefined) return eq(notifications.ukeStationId, ukeStationId);
  throw new Error("Station notification requires a station id");
}

export async function coalesceOrCreateStationNotification(params: CoalesceStationNotificationParams): Promise<CoalesceStationNotificationResult> {
  const { userId, detached, type, title, metadata, actionUrl } = params;

  if (detached) {
    const [inserted] = await db
      .insert(notifications)
      .values({
        userId,
        stationId: null,
        ukeStationId: null,
        type,
        title,
        metadata: metadata ?? null,
        actionUrl: actionUrl ?? null,
        pushQueuedAt: new Date(),
      })
      .returning({ id: notifications.id });

    if (!inserted) throw new Error("Failed to create station notification");
    return { id: inserted.id, isNew: true };
  }

  return insertOrCoalesce(params, stationTargetCondition(params), COALESCE_RETRIES);
}
