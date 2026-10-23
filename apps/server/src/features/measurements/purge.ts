import { devices, uploads } from "@openbts/drizzle";
import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { logger } from "../../utils/logger.js";
import { newUploadsStore, rawFilePath, rawStoreFor } from "./rawStore.js";
import { loadCrowdSettings } from "./settings.js";
import type { UploadRow } from "./uploads.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REJECTED_FILE_DAYS = 30;
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;
const PURGE_BATCH = 500;
const SWEPT_DAYS = 7;
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

export async function deleteUploadFile(upload: Pick<UploadRow, "id" | "store" | "receivedAt" | "bodySha256">): Promise<void> {
  await rawStoreFor(upload.store).remove(rawFilePath(upload.receivedAt, upload.id, upload.bodySha256));
  await db
    .update(uploads)
    .set({ objectDeletedAt: sql`now()` })
    .where(eq(uploads.id, upload.id));
}

async function findDueFiles(retentionDays: number) {
  const now = Date.now();
  return db
    .select({ id: uploads.id, store: uploads.store, receivedAt: uploads.receivedAt, bodySha256: uploads.bodySha256 })
    .from(uploads)
    .innerJoin(devices, eq(devices.id, uploads.deviceId))
    .where(
      and(
        isNull(uploads.objectDeletedAt),
        ne(uploads.status, "processing"),
        or(
          eq(uploads.status, "withdrawn"),
          and(eq(uploads.status, "rejected"), lt(uploads.statusChangedAt, new Date(now - REJECTED_FILE_DAYS * DAY_MS))),
          lt(uploads.receivedAt, new Date(now - retentionDays * DAY_MS)),
          isNull(devices.userId),
        ),
      ),
    )
    .orderBy(asc(uploads.receivedAt))
    .limit(PURGE_BATCH);
}

export async function purgeRawFiles(): Promise<void> {
  const { rawRetentionDays } = await loadCrowdSettings();
  let deleted = 0;
  let due = await findDueFiles(rawRetentionDays);
  while (due.length > 0) {
    for (const upload of due) await deleteUploadFile(upload);
    deleted += due.length;
    due = due.length < PURGE_BATCH ? [] : await findDueFiles(rawRetentionDays);
  }
  if (deleted > 0) logger.info("observations.raw_files.purged", { deleted });
}

export async function sweepOrphanFiles(): Promise<void> {
  const store = newUploadsStore();
  const settledBefore = Date.now() - ORPHAN_MIN_AGE_MS;
  let deleted = 0;

  for (let daysAgo = 0; daysAgo < SWEPT_DAYS; daysAgo++) {
    const settled = (await store.listDay(new Date(Date.now() - daysAgo * DAY_MS))).filter((name) => name.modifiedAt.getTime() < settledBefore);
    const files = settled.filter((name) => !name.isTemporary);
    const uploadIds = [...new Set(files.flatMap((name) => name.path.split("/").at(-1)?.split(".")[0] ?? []))];
    const recorded =
      uploadIds.length === 0
        ? []
        : await db
            .select({ id: uploads.id, receivedAt: uploads.receivedAt, bodySha256: uploads.bodySha256 })
            .from(uploads)
            .where(inArray(uploads.id, uploadIds));
    const recordedPaths = new Set(recorded.map((upload) => rawFilePath(upload.receivedAt, upload.id, upload.bodySha256)));

    const orphans = settled.filter((name) => name.isTemporary || !recordedPaths.has(name.path));
    for (const orphan of orphans) await store.remove(orphan.path);
    deleted += orphans.length;
  }
  if (deleted > 0) logger.info("observations.raw_files.orphans_deleted", { deleted });
}
