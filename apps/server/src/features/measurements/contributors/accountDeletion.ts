import { devices, uploads } from "@openbts/drizzle";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { logger } from "../../../utils/logger.js";
import { devicesOf } from "../devices/read.js";
import { deleteUploadFile } from "../rawFiles/purge.js";

export async function forgetContributorMeasurements(userId: string): Promise<void> {
  const files = await db.transaction(async (tx) => {
    await tx
      .update(uploads)
      .set({ status: "withdrawn", statusChangedAt: sql`now()` })
      .where(and(inArray(uploads.deviceId, devicesOf(userId)), inArray(uploads.status, ["received", "processing"])));
    await tx.update(devices).set({ label: null, phoneHmac: null }).where(eq(devices.userId, userId));
    return tx
      .select({ id: uploads.id, store: uploads.store, receivedAt: uploads.receivedAt, bodySha256: uploads.bodySha256 })
      .from(uploads)
      .where(and(inArray(uploads.deviceId, devicesOf(userId)), isNull(uploads.objectDeletedAt)));
  });

  const deletions = await Promise.allSettled(files.map(deleteUploadFile));
  const failed = deletions.filter((deletion) => deletion.status === "rejected").length;
  if (failed > 0) logger.warn("observations.account_deletion.files_left", { userId, failed, note: "the hourly purge deletes them" });
}
