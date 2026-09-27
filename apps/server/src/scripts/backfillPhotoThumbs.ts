import { attachments, locationPhotos, submissionPhotos } from "@openbts/drizzle";
import { db, sql } from "@openbts/drizzle/db";
import { and, asc, eq, exists, gt, or } from "drizzle-orm";
import fs from "node:fs/promises";

import { encodeLegacyPhotoThumb } from "../utils/image.js";
import { photoFilePath } from "../utils/photoFiles.js";

const BATCH_SIZE = 100;
const CONCURRENCY = 4;

type PendingAttachment = { id: number; uuid: string };
type Outcome = "done" | "missing" | "failed";

async function fetchBatch(afterId: number): Promise<PendingAttachment[]> {
  return db
    .select({ id: attachments.id, uuid: attachments.uuid })
    .from(attachments)
    .where(
      and(
        gt(attachments.id, afterId),
        eq(attachments.has_thumb, false),
        or(
          exists(db.select({ id: locationPhotos.id }).from(locationPhotos).where(eq(locationPhotos.attachment_id, attachments.id))),
          exists(db.select({ id: submissionPhotos.id }).from(submissionPhotos).where(eq(submissionPhotos.attachment_id, attachments.id))),
        ),
      ),
    )
    .orderBy(asc(attachments.id))
    .limit(BATCH_SIZE);
}

async function backfillThumb(attachment: PendingAttachment): Promise<Outcome> {
  try {
    const display = await fs.readFile(photoFilePath(attachment.uuid));
    const { thumb, width, height } = await encodeLegacyPhotoThumb(display);
    await fs.writeFile(photoFilePath(attachment.uuid, "thumb"), thumb);
    await db
      .update(attachments)
      .set({ width, height, has_thumb: true, size: display.length + thumb.length })
      .where(eq(attachments.id, attachment.id));
    return "done";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    console.error(`thumb failed for ${attachment.uuid}:`, code ?? error);
    return code === "ENOENT" ? "missing" : "failed";
  }
}

async function main() {
  const startedAt = Date.now();
  const counts: Record<Outcome, number> = { done: 0, missing: 0, failed: 0 };
  let cursor = 0;

  /* eslint-disable no-await-in-loop */
  while (true) {
    const batch = await fetchBatch(cursor);
    const last = batch.at(-1);
    if (!last) break;
    cursor = last.id;

    for (let index = 0; index < batch.length; index += CONCURRENCY) {
      const outcomes = await Promise.all(batch.slice(index, index + CONCURRENCY).map(backfillThumb));
      for (const outcome of outcomes) counts[outcome]++;
    }
    console.log(`processed up to attachment #${cursor}:`, counts);
  }
  /* eslint-enable no-await-in-loop */

  console.log(`done in ${Math.round((Date.now() - startedAt) / 1000)}s:`, counts);
}

main()
  .catch((error: unknown) => {
    console.error("backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
    process.exit();
  });
