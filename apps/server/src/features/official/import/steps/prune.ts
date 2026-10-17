/* eslint-disable no-await-in-loop */
import {
  officialDatasetSlices,
  officialDatasets,
  officialFiles,
  officialImportRuns,
  officialSnapshotFiles,
  officialSnapshotSlices,
  officialSnapshots,
} from "@openbts/drizzle";
import { and, inArray, lt, sql } from "drizzle-orm";

import type { DbTx } from "../../../../types/global.js";
import { logger } from "../../../../utils/logger.js";
import { archiveKeyOf } from "../archive.js";
import type { AfterStep, AfterStepContext } from "../types.js";

type ArchivedFile = { sha256: string; mediaType: string; sizeBytes: number };

const RUN_RETENTION_DAYS = 180;
const DAY_MS = 86_400_000;

function pruneCutoffOf(runStartedAt: Date): Date {
  return new Date(runStartedAt.getTime() - RUN_RETENTION_DAYS * DAY_MS);
}

async function readPrunableFiles(tx: DbTx, sourceId: number): Promise<ArchivedFile[]> {
  const files = await tx.execute<ArchivedFile>(sql`
    WITH newest AS (
      SELECT DISTINCT ON (covered.dataset_id, covered.slice) covered.snapshot_id
      FROM ${officialSnapshotSlices} AS covered
      JOIN ${officialSnapshots} AS snapshot ON snapshot.id = covered.snapshot_id
      ORDER BY covered.dataset_id, covered.slice, snapshot.fetched_at DESC, snapshot.id DESC
    ), kept AS (
      SELECT applied.snapshot_id FROM ${officialDatasetSlices} AS applied WHERE applied.snapshot_id IS NOT NULL
      UNION
      SELECT newest.snapshot_id FROM newest
    )
    SELECT DISTINCT archived.sha256, archived.media_type AS "mediaType", archived.size_bytes::double precision AS "sizeBytes"
    FROM ${officialSnapshotSlices} AS covered
    JOIN ${officialDatasets} AS dataset ON dataset.id = covered.dataset_id
    JOIN ${officialSnapshotFiles} AS part ON part.snapshot_id = covered.snapshot_id
    JOIN ${officialFiles} AS archived ON archived.sha256 = part.file_sha256
    WHERE dataset.source_id = ${sourceId}::integer
      AND NOT EXISTS (
        SELECT 1 FROM ${officialSnapshotFiles} AS kept_part
        JOIN kept ON kept.snapshot_id = kept_part.snapshot_id
        WHERE kept_part.file_sha256 = archived.sha256
      )
    ORDER BY archived.sha256
  `);
  return [...files];
}

async function pruneArchive(context: AfterStepContext): Promise<void> {
  const { run, archive } = context;
  const files = await context.transaction((tx) => readPrunableFiles(tx, run.sourceId));
  const freed = { files: 0, bytes: 0 };
  for (const file of files) {
    try {
      if (await archive.remove(archiveKeyOf(file.sha256, file.mediaType))) {
        freed.files += 1;
        freed.bytes += file.sizeBytes;
      }
    } catch (error) {
      await context.recordError(error);
    }
  }
  logger.info("official.import.archive_pruned", { runId: run.id, ...freed });
}

async function perform(context: AfterStepContext): Promise<void> {
  await pruneArchive(context);
  await context.transaction(async (tx) => {
    await tx
      .delete(officialImportRuns)
      .where(
        and(
          lt(officialImportRuns.createdAt, pruneCutoffOf(context.run.startedAt)),
          inArray(officialImportRuns.state, ["done", "failed", "cancelled"]),
        ),
      );
    await context.markFinished(tx);
  });
}

export const prune: AfterStep = { name: "prune", runsInDryRun: false, perform };
