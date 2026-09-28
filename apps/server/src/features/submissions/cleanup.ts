import {
  notifications,
  proposedCells,
  proposedLocations,
  proposedSectors,
  proposedStations,
  submissionLocationPhotoSelections,
  submissionPhotos,
  submissions,
} from "@openbts/drizzle";
import { and, eq, inArray, isNotNull, lt, notExists, or } from "drizzle-orm";

import db from "../../database/psql.js";
import { logger } from "../../utils/logger.js";
import { runAuditedOperation, systemAuditContext } from "../audit/index.js";
import {
  type CreateNotificationParams,
  type PreparedNotification,
  deliverPreparedNotificationPush,
  insertPreparedNotification,
  prepareNotification,
} from "../notifications/service.js";

type PreparedNotificationDelivery = {
  params: CreateNotificationParams;
  prepared: PreparedNotification;
};

export async function cleanupOrphanedSubmissions(): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const condition = and(
    eq(submissions.status, "pending"),
    isNotNull(submissions.pending_photos),
    lt(submissions.createdAt, cutoff),
    notExists(db.select({ id: submissionPhotos.id }).from(submissionPhotos).where(eq(submissionPhotos.submission_id, submissions.id))),
    or(
      and(
        eq(submissions.type, "new"),
        notExists(db.select({ id: proposedCells.id }).from(proposedCells).where(eq(proposedCells.submission_id, submissions.id))),
      ),
      and(
        eq(submissions.type, "update"),
        notExists(db.select({ id: proposedStations.id }).from(proposedStations).where(eq(proposedStations.submission_id, submissions.id))),
        notExists(db.select({ id: proposedLocations.id }).from(proposedLocations).where(eq(proposedLocations.submission_id, submissions.id))),
        notExists(db.select({ id: proposedSectors.id }).from(proposedSectors).where(eq(proposedSectors.submission_id, submissions.id))),
        notExists(db.select({ id: proposedCells.id }).from(proposedCells).where(eq(proposedCells.submission_id, submissions.id))),
        notExists(
          db
            .select({ id: submissionLocationPhotoSelections.location_photo_id })
            .from(submissionLocationPhotoSelections)
            .where(eq(submissionLocationPhotoSelections.submission_id, submissions.id)),
        ),
      ),
    ),
  );
  const candidates = await db.select({ id: submissions.id, submitterId: submissions.submitter_id }).from(submissions).where(condition);
  if (candidates.length === 0) return;

  const candidateIds = candidates.map(({ id }) => id);
  const preparedNotifications = new Map(
    await Promise.all(
      candidates.flatMap(({ id, submitterId }) => {
        if (submitterId === null) return [];
        const params: CreateNotificationParams = {
          userId: submitterId,
          type: "submission_photo_upload_failed",
          actionUrl: "/account/submissions",
        };
        return [prepareNotification(params).then((prepared) => [id, { params, prepared } satisfies PreparedNotificationDelivery] as const)];
      }),
    ),
  );
  const result = await runAuditedOperation(
    systemAuditContext(),
    { kind: "system.submission_cleanup", metadata: { cutoff: cutoff.toISOString() } },
    async (tx, audit) => {
      const deleted = await tx
        .delete(submissions)
        .where(and(inArray(submissions.id, candidateIds), condition))
        .returning();
      const deletedIds = deleted.map(({ id }) => id);
      if (deletedIds.length > 0) await tx.delete(notifications).where(inArray(notifications.submissionId, deletedIds));

      const pushDeliveries = await Promise.all(
        deleted.flatMap((submission) => {
          const notification = preparedNotifications.get(submission.id);
          if (!notification || submission.submitter_id !== notification.params.userId) return [];
          return [
            insertPreparedNotification(tx, notification.params, notification.prepared).then((notificationId) => ({
              ...notification,
              notificationId,
            })),
          ];
        }),
      );
      await audit.logMany(
        deleted.map((submission) => ({
          entity: "submissions",
          op: "delete",
          recordId: submission.id,
          stationId: submission.station_id,
          old: submission,
        })),
      );
      return { deleted, pushDeliveries };
    },
  );
  if (result.deleted.length === 0) return;

  const notificationResults = await Promise.allSettled(
    result.pushDeliveries.map(({ params, prepared, notificationId }) => deliverPreparedNotificationPush(params, prepared, notificationId)),
  );
  const failedNotifications = notificationResults.filter(({ status }) => status === "rejected");
  if (failedNotifications.length > 0)
    logger.error("Failed to notify users about submissions deleted after photo upload timeout", { count: failedNotifications.length });

  logger.info(`Cleaned up ${result.deleted.length} orphaned photo-only submissions`);
}
