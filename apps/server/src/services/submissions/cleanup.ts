import { submissionPhotos, submissions } from "@openbts/drizzle";
import { and, eq, isNotNull, lt, notExists } from "drizzle-orm";

import db from "../../database/psql.js";
import { logger } from "../../utils/logger.js";

export async function cleanupOrphanedSubmissions(): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const result = await db
    .delete(submissions)
    .where(
      and(
        eq(submissions.status, "pending"),
        isNotNull(submissions.pending_photos),
        lt(submissions.createdAt, cutoff),
        notExists(db.select({ id: submissionPhotos.id }).from(submissionPhotos).where(eq(submissionPhotos.submission_id, submissions.id))),
      ),
    )
    .returning({ id: submissions.id });
  if (result.length > 0) logger.info(`Cleaned up ${result.length} orphaned photo-only submissions`);
}
