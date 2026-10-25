import { uploadFolds, uploads, users } from "@openbts/drizzle";
import type { MeasurementExclusion } from "@openbts/shared/contract";
import { type SQL, and, count, eq, inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { DetailedErrorResponse, ErrorResponse } from "../../../errors.js";
import { chunks, unique } from "../../../lib/collections.js";
import { actorIdFromRequest } from "../../access/access.js";
import { runAuditedOperation, standaloneAuditContext } from "../../audit/index.js";
import { devicesOf } from "../devices/read.js";
import { queueEngineRun, queueSubtractions, wakeEngineForUploads } from "../engineRuns.js";
import { REMOVABLE_STATUSES, type UploadRow } from "./read.js";

const UPLOADS_PER_STATEMENT = 1000;

async function assertUploadsExist(uploadIds: readonly string[]): Promise<void> {
  const distinctIds = unique(uploadIds.map((id) => id.toLowerCase()));
  const [found] = await db.select({ total: count() }).from(uploads).where(inArray(uploads.id, distinctIds));
  if ((found?.total ?? 0) !== distinctIds.length) throw new ErrorResponse("NOT_FOUND", { message: "Not every upload in `uploadIds` exists" });
}

async function assertAccountExists(userId: string): Promise<void> {
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!account) throw new ErrorResponse("NOT_FOUND", { message: "No account has this `userId`" });
}

function chosenUploads(exclusion: MeasurementExclusion): SQL {
  if ("uploadIds" in exclusion) return inArray(uploads.id, exclusion.uploadIds);
  return inArray(uploads.deviceId, devicesOf(exclusion.userId));
}

export async function excludeUploads(req: FastifyRequest, exclusion: MeasurementExclusion): Promise<number> {
  if ("uploadIds" in exclusion) await assertUploadsExist(exclusion.uploadIds);
  else await assertAccountExists(exclusion.userId);

  return runAuditedOperation(standaloneAuditContext(req), { kind: "observations.upload_exclude" }, async (tx, audit) => {
    const excluded = await tx
      .select({ id: uploads.id, status: uploads.status, statusReason: uploads.statusReason })
      .from(uploads)
      .where(and(chosenUploads(exclusion), inArray(uploads.status, REMOVABLE_STATUSES)))
      .for("no key update");

    for (const batch of chunks(excluded, UPLOADS_PER_STATEMENT)) {
      const batchIds = batch.map((upload) => upload.id);
      // oxlint-disable-next-line no-await-in-loop
      await tx
        .update(uploads)
        .set({ status: "excluded", statusReason: exclusion.reason, statusChangedAt: sql`now()`, excludedById: actorIdFromRequest(req) })
        .where(inArray(uploads.id, batchIds));
      // oxlint-disable-next-line no-await-in-loop
      await audit.logMany(
        batch.map((upload) => ({
          entity: "uploads",
          op: "update",
          recordId: upload.id,
          old: { status: upload.status, statusReason: upload.statusReason },
          new: { status: "excluded", statusReason: exclusion.reason },
        })),
      );
    }
    await queueSubtractions(tx, excluded, "rebuild");
    return excluded.length;
  });
}

export async function restoreUpload(req: FastifyRequest, upload: UploadRow): Promise<void> {
  await runAuditedOperation(standaloneAuditContext(req), { kind: "observations.upload_restore" }, async (tx, audit) => {
    const [fold] = await tx.select({ uploadId: uploadFolds.uploadId }).from(uploadFolds).where(eq(uploadFolds.uploadId, upload.id)).limit(1);
    const status = fold ? "processed" : "received";
    const backInQueue = fold ? {} : { claimedAt: null, attempts: 0, lastError: null };
    const [restored] = await tx
      .update(uploads)
      .set({ status, statusReason: null, statusChangedAt: sql`now()`, excludedById: null, ...backInQueue })
      .where(and(eq(uploads.id, upload.id), eq(uploads.status, "excluded")))
      .returning({ id: uploads.id });
    if (!restored) throw new DetailedErrorResponse("CONFLICT", [{ kind: "notExcluded" }], { message: "Only an excluded upload can be restored" });

    await audit.log({
      entity: "uploads",
      op: "update",
      recordId: upload.id,
      old: { status: "excluded", statusReason: upload.statusReason },
      new: { status, statusReason: null },
    });
    if (fold) await queueEngineRun(tx, "restore");
    else await wakeEngineForUploads(tx);
  });
}
