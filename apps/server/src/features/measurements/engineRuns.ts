import { engineRuns, uploadFolds, uploads } from "@openbts/drizzle";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { chunks } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";

const UPLOADS_PER_STATEMENT = 1000;

type FoldedUpload = { uploadId: string; objectDeletedAt: Date | null };
type RefoldScope = { readingBlockId: number } | { userId: string } | { quirkRuleId: string };

async function findFoldedUploads(tx: DbTx, uploadIds: readonly string[]): Promise<FoldedUpload[]> {
  const folded = await Promise.all(
    chunks(uploadIds, UPLOADS_PER_STATEMENT).map((batch) =>
      tx
        .select({ uploadId: uploadFolds.uploadId, objectDeletedAt: uploads.objectDeletedAt })
        .from(uploadFolds)
        .innerJoin(uploads, eq(uploads.id, uploadFolds.uploadId))
        .where(and(inArray(uploadFolds.uploadId, batch), isNull(uploadFolds.unfoldedAt))),
    ),
  );
  return folded.flat();
}

export async function wakeEngine(tx: DbTx): Promise<void> {
  await tx.execute(sql`NOTIFY observations, 'run'`);
}

export async function wakeEngineForUploads(tx: DbTx): Promise<void> {
  await tx.execute(sql`NOTIFY observations, 'upload'`);
}

export async function queueEngineRun(tx: DbTx, kind: "subtract" | "restore"): Promise<void> {
  const [waiting] = await tx
    .select({ id: engineRuns.id })
    .from(engineRuns)
    .where(and(eq(engineRuns.kind, kind), isNull(engineRuns.startedAt)))
    .limit(1);
  if (!waiting) await tx.insert(engineRuns).values({ kind });
  await wakeEngine(tx);
}

export async function queueSubtractions(tx: DbTx, removedUploads: readonly { id: string }[], whenFileGone: "rebuild" | "keep"): Promise<void> {
  const uploadIds = removedUploads.map((upload) => upload.id);
  const folded = await findFoldedUploads(tx, uploadIds);
  if (folded.some((upload) => upload.objectDeletedAt === null)) await queueEngineRun(tx, "subtract");
  if (whenFileGone === "keep") return;

  const filesGone = folded.filter((upload) => upload.objectDeletedAt !== null);
  if (filesGone.length === 0) return;
  await tx.insert(engineRuns).values(filesGone.map((upload) => ({ kind: "rebuild" as const, params: { uploadId: upload.uploadId } })));
  await wakeEngine(tx);
}

export async function queueRefold(tx: DbTx, params: RefoldScope): Promise<void> {
  const [waiting] = await tx
    .select({ id: engineRuns.id })
    .from(engineRuns)
    .where(and(eq(engineRuns.kind, "refold"), isNull(engineRuns.startedAt), eq(engineRuns.params, params)))
    .limit(1);
  if (waiting) return;

  await tx.insert(engineRuns).values({ kind: "refold", params });
  await wakeEngine(tx);
}
