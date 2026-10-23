import { devices, uploads } from "@openbts/drizzle";
import type { MeasurementWithdrawal } from "@openbts/shared/contract";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { logger } from "../../utils/logger.js";
import { devicesOf } from "./devices.js";
import { deleteUploadFile } from "./purge.js";
import { REMOVABLE_STATUSES } from "./uploads.js";

export async function withdrawUploads(userId: string, withdrawal: MeasurementWithdrawal): Promise<number> {
  const uploadIds = "uploadIds" in withdrawal ? [...new Set(withdrawal.uploadIds.map((id) => id.toLowerCase()))] : null;
  if (uploadIds !== null) {
    const [owned] = await db
      .select({ total: count() })
      .from(uploads)
      .where(and(inArray(uploads.id, uploadIds), inArray(uploads.deviceId, devicesOf(userId))));
    if ((owned?.total ?? 0) !== uploadIds.length) throw new ErrorResponse("NOT_FOUND", { message: "Not every upload in `uploadIds` is yours" });
  }

  const withdrawn = await db
    .update(uploads)
    .set({ status: "withdrawn", statusChangedAt: sql`now()` })
    .where(
      and(
        inArray(uploads.deviceId, devicesOf(userId)),
        inArray(uploads.status, REMOVABLE_STATUSES),
        uploadIds === null ? undefined : inArray(uploads.id, uploadIds),
      ),
    )
    .returning({ id: uploads.id });
  return withdrawn.length;
}

export async function forgetContributorMeasurements(userId: string): Promise<void> {
  const files = await db.transaction(async (tx) => {
    await tx
      .update(uploads)
      .set({ status: "withdrawn", statusChangedAt: sql`now()` })
      .where(and(inArray(uploads.deviceId, devicesOf(userId)), eq(uploads.status, "received")));
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
