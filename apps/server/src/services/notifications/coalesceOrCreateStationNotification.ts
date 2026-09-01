import { notifications } from "@openbts/drizzle";
import { and, desc, eq, isNull } from "drizzle-orm";

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

  merged.count = numericMetadataValue(current ?? {}, "count") + Math.max(1, numericMetadataValue(incoming ?? {}, "count"));
  return merged;
}

export async function coalesceOrCreateStationNotification({
  userId,
  stationId,
  ukeStationId,
  detached,
  type,
  title,
  metadata,
  actionUrl,
}: CoalesceStationNotificationParams): Promise<CoalesceStationNotificationResult> {
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

  const targetCondition =
    stationId !== undefined
      ? eq(notifications.stationId, stationId)
      : ukeStationId !== undefined
        ? eq(notifications.ukeStationId, ukeStationId)
        : undefined;
  if (targetCondition === undefined) throw new Error("Station notification requires a station id");

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
      pushQueuedAt: new Date(),
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

  if (!existing) throw new Error("Failed to create station notification");

  await db
    .update(notifications)
    .set({
      metadata: mergeMetadata(existing.metadata, metadata, type),
      actionUrl: actionUrl ?? null,
      pushQueuedAt: new Date(),
      pushSentAt: null,
      updatedAt: new Date(),
    })
    .where(eq(notifications.id, existing.id));

  return { id: existing.id, isNew: false };
}
