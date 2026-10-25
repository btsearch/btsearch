import { uploads } from "@openbts/drizzle";
import type { MeasurementWithdrawal } from "@openbts/shared/contract";
import { and, count, inArray, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { unique } from "../../../lib/collections.js";
import { devicesOf } from "../devices/read.js";
import { queueSubtractions } from "../engineRuns.js";
import { REMOVABLE_STATUSES } from "./read.js";

async function assertUploadsOwned(userId: string, uploadIds: readonly string[]): Promise<void> {
  const [owned] = await db
    .select({ total: count() })
    .from(uploads)
    .where(and(inArray(uploads.id, [...uploadIds]), inArray(uploads.deviceId, devicesOf(userId))));
  if ((owned?.total ?? 0) !== uploadIds.length) throw new ErrorResponse("NOT_FOUND", { message: "Not every upload in `uploadIds` is yours" });
}

export async function withdrawUploads(userId: string, withdrawal: MeasurementWithdrawal): Promise<number> {
  const uploadIds = "uploadIds" in withdrawal ? unique(withdrawal.uploadIds.map((id) => id.toLowerCase())) : null;
  if (uploadIds !== null) await assertUploadsOwned(userId, uploadIds);

  return db.transaction(async (tx) => {
    const withdrawn = await tx
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
    await queueSubtractions(tx, withdrawn, "keep");
    return withdrawn.length;
  });
}
