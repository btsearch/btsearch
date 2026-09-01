import { submissionLocationPhotoSelections, submissionPhotos } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { and, eq, ne } from "drizzle-orm/sql";

export async function clearOtherMainPhotos(submissionId: string, keepPhotoId: number | null): Promise<void> {
  await Promise.all([
    db
      .update(submissionPhotos)
      .set({ is_main: false })
      .where(
        keepPhotoId === null
          ? eq(submissionPhotos.submission_id, submissionId)
          : and(eq(submissionPhotos.submission_id, submissionId), ne(submissionPhotos.id, keepPhotoId)),
      ),
    db.update(submissionLocationPhotoSelections).set({ is_main: false }).where(eq(submissionLocationPhotoSelections.submission_id, submissionId)),
  ]);
}
