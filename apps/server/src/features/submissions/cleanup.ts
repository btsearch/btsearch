import {
  attachments,
  locationPhotos,
  notifications,
  proposedCells,
  proposedLocations,
  proposedSectors,
  proposedStations,
  submissionLocationPhotoSelections,
  submissionPhotos,
  submissions,
} from "@openbts/drizzle";
import type { RejectedPhotoRemoval } from "@openbts/shared/contract";
import { type SQL, and, asc, eq, exists, inArray, isNotNull, lt, notExists, or } from "drizzle-orm";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";
import { logger } from "../../utils/logger.js";
import { deletePhotoFiles } from "../../utils/photoFiles.js";
import { type AuditContext, type AuditMetadata, runAuditedOperation, systemAuditContext } from "../audit/index.js";
import {
  type CreateNotificationParams,
  type PreparedNotification,
  deliverPreparedNotificationPush,
  insertPreparedNotification,
  prepareNotification,
} from "../notifications/service.js";
import { getSubmissionStationLabels, stationLabelMetadata } from "./stationLabels.js";

type PreparedNotificationDelivery = {
  params: CreateNotificationParams;
  prepared: PreparedNotification;
};
type RejectedPhotoRemovalOptions = { rejectedBefore?: Date };
type RemovedPhotoBatch = { submissions: number; photos: number; attachmentUuids: string[] };

const REJECTED_SUBMISSIONS_PER_BATCH = 50;
const MAX_BATCHES_PER_CALL = 10;

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
  const candidates = await db
    .select({ id: submissions.id, submitterId: submissions.submitter_id, stationId: submissions.station_id })
    .from(submissions)
    .where(condition);
  if (candidates.length === 0) return;

  const candidateIds = candidates.map(({ id }) => id);
  const stationLabels = await getSubmissionStationLabels(candidates.map(({ id, stationId }) => ({ id, station_id: stationId })));
  const preparedNotifications = new Map(
    await Promise.all(
      candidates.flatMap(({ id, submitterId }) => {
        if (submitterId === null) return [];
        const params: CreateNotificationParams = {
          userId: submitterId,
          type: "submission_photo_upload_failed",
          metadata: stationLabelMetadata(stationLabels.get(id)),
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
      await tx.select({ id: submissions.id }).from(submissions).where(inArray(submissions.id, candidateIds)).orderBy(submissions.id).for("update");
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

function isRejectedWithPhotos(rejectedBefore?: Date): SQL | undefined {
  return and(
    eq(submissions.status, "rejected"),
    rejectedBefore === undefined ? undefined : lt(submissions.reviewed_at, rejectedBefore),
    exists(db.select({ id: submissionPhotos.id }).from(submissionPhotos).where(eq(submissionPhotos.submission_id, submissions.id))),
  );
}

export function isAttachmentUsedByNoLocation(tx: DbTx): SQL {
  return notExists(tx.select({ id: locationPhotos.id }).from(locationPhotos).where(eq(locationPhotos.attachment_id, attachments.id)));
}

export async function removeRejectedSubmissionPhotos(
  context: AuditContext,
  { rejectedBefore }: RejectedPhotoRemovalOptions = {},
): Promise<RejectedPhotoRemoval> {
  const condition = isRejectedWithPhotos(rejectedBefore);
  const candidates = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(condition)
    .orderBy(asc(submissions.reviewed_at), asc(submissions.id))
    .limit(REJECTED_SUBMISSIONS_PER_BATCH + 1);
  const hasMore = candidates.length > REJECTED_SUBMISSIONS_PER_BATCH;
  const candidateIds = candidates.slice(0, REJECTED_SUBMISSIONS_PER_BATCH).map(({ id }) => id);
  if (candidateIds.length === 0) return { submissions: 0, photos: 0, hasMore };

  const kind = context.source === "system" ? "system.submission_cleanup" : "submission.cleanup";
  const metadata: AuditMetadata = { cleanup: "rejected_photos" };
  if (rejectedBefore !== undefined) metadata.rejected_before = rejectedBefore.toISOString();

  const removed = await runAuditedOperation(context, { kind, metadata }, async (tx, audit): Promise<RemovedPhotoBatch> => {
    const locked = await tx
      .select()
      .from(submissions)
      .where(and(inArray(submissions.id, candidateIds), condition))
      .orderBy(submissions.id)
      .for("update");
    const lockedIds = locked.map(({ id }) => id);
    const removedPhotos =
      lockedIds.length === 0 ? [] : await tx.delete(submissionPhotos).where(inArray(submissionPhotos.submission_id, lockedIds)).returning();
    if (removedPhotos.length === 0) return { submissions: 0, photos: 0, attachmentUuids: [] };

    const submissionIds = unique(removedPhotos.map((photo) => photo.submission_id));
    const attachmentIds = unique(removedPhotos.map((photo) => photo.attachment_id));
    const removedAttachments = await tx
      .delete(attachments)
      .where(and(inArray(attachments.id, attachmentIds), isAttachmentUsedByNoLocation(tx)))
      .returning({ uuid: attachments.uuid });
    const cleared = await tx
      .update(submissions)
      .set({ pending_photos: null })
      .where(and(inArray(submissions.id, submissionIds), isNotNull(submissions.pending_photos)))
      .returning();

    const lockedById = new Map(locked.map((submission) => [submission.id, submission]));
    await audit.logMany([
      ...removedPhotos.map((photo) => ({
        entity: "submission_photos" as const,
        op: "delete" as const,
        recordId: photo.id,
        stationId: lockedById.get(photo.submission_id)?.station_id,
        old: photo,
      })),
      ...cleared.map((submission) => ({
        entity: "submissions" as const,
        op: "update" as const,
        recordId: submission.id,
        stationId: submission.station_id,
        old: lockedById.get(submission.id),
        new: submission,
      })),
    ]);
    return { submissions: submissionIds.length, photos: removedPhotos.length, attachmentUuids: removedAttachments.map(({ uuid }) => uuid) };
  });

  await deletePhotoFiles(removed.attachmentUuids);
  if (removed.photos > 0) logger.info("rejected_submission_photos_removed", { submissions: removed.submissions, photos: removed.photos });
  return { submissions: removed.submissions, photos: removed.photos, hasMore };
}

export async function removeRejectedSubmissionPhotosInBatches(context: AuditContext): Promise<RejectedPhotoRemoval> {
  const total: RejectedPhotoRemoval = { submissions: 0, photos: 0, hasMore: true };
  for (let batch = 0; batch < MAX_BATCHES_PER_CALL && total.hasMore; batch++) {
    // eslint-disable-next-line no-await-in-loop
    const removed = await removeRejectedSubmissionPhotos(context);
    total.submissions += removed.submissions;
    total.photos += removed.photos;
    total.hasMore = removed.hasMore;
  }
  return total;
}
