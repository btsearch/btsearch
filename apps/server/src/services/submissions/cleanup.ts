import { submissionPhotos, submissions } from "@openbts/drizzle";
import { and, eq, inArray, isNotNull, lt, notExists } from "drizzle-orm";

import db from "../../database/psql.js";
import { logger } from "../../utils/logger.js";
import { runAuditedOperation, systemAuditContext } from "../audit/index.js";

export async function cleanupOrphanedSubmissions(): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const condition = and(
    eq(submissions.status, "pending"),
    isNotNull(submissions.pending_photos),
    lt(submissions.createdAt, cutoff),
    notExists(db.select({ id: submissionPhotos.id }).from(submissionPhotos).where(eq(submissionPhotos.submission_id, submissions.id))),
  );
  const candidates = await db.select({ id: submissions.id }).from(submissions).where(condition);
  if (candidates.length === 0) return;

  const candidateIds = candidates.map(({ id }) => id);
  const result = await runAuditedOperation(
    systemAuditContext(),
    { kind: "system.submission_cleanup", metadata: { cutoff: cutoff.toISOString() } },
    async (tx, audit) => {
      const deleted = await tx
        .delete(submissions)
        .where(
          and(
            inArray(submissions.id, candidateIds),
            eq(submissions.status, "pending"),
            isNotNull(submissions.pending_photos),
            lt(submissions.createdAt, cutoff),
            notExists(tx.select({ id: submissionPhotos.id }).from(submissionPhotos).where(eq(submissionPhotos.submission_id, submissions.id))),
          ),
        )
        .returning();
      await audit.logMany(
        deleted.map((submission) => ({
          entity: "submissions",
          op: "delete",
          recordId: submission.id,
          stationId: submission.station_id,
          old: submission,
        })),
      );
      return deleted;
    },
  );
  if (result.length > 0) logger.info(`Cleaned up ${result.length} orphaned photo-only submissions`);
}
