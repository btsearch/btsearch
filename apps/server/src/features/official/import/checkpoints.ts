import {
  officialDatasetSlices,
  officialImportRunApprovals,
  officialImportRunDatasets,
  officialImportRunSkips,
  officialImportRunSlices,
} from "@openbts/drizzle";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbTx } from "../../../types/global.js";
import type { SkipRow } from "./skips.js";
import type { SliceCount, SliceOutcome } from "./types.js";

type Reader = Pick<DbTx, "select">;
type RunDatasetKey = { runId: string; datasetId: number };
type SliceCheckpoint = SliceCount & { outcome: SliceOutcome };

export async function readCheckpointedSlices(reader: Reader, { runId, datasetId }: RunDatasetKey): Promise<Set<string>> {
  const rows = await reader
    .select({ slice: officialImportRunSlices.slice })
    .from(officialImportRunSlices)
    .where(and(eq(officialImportRunSlices.runId, runId), eq(officialImportRunSlices.datasetId, datasetId)));

  return new Set(rows.map((row) => row.slice));
}

export async function readApprovals(reader: Reader, { runId, datasetId }: RunDatasetKey): Promise<Map<string, number>> {
  const rows = await reader
    .select({ slice: officialImportRunApprovals.slice, snapshotId: officialImportRunApprovals.snapshotId })
    .from(officialImportRunApprovals)
    .where(and(eq(officialImportRunApprovals.runId, runId), eq(officialImportRunApprovals.datasetId, datasetId)));

  return new Map(rows.map((row) => [row.slice, row.snapshotId]));
}

export async function readAppliedSnapshots(tx: DbTx, datasetId: number, slices: readonly string[]): Promise<Map<string, number | null>> {
  const rows = await tx
    .select({ slice: officialDatasetSlices.key, snapshotId: officialDatasetSlices.snapshotId })
    .from(officialDatasetSlices)
    .where(and(eq(officialDatasetSlices.datasetId, datasetId), inArray(officialDatasetSlices.key, [...slices])));

  return new Map(rows.map((row) => [row.slice, row.snapshotId]));
}

export async function saveCheckpoints(
  tx: DbTx,
  key: RunDatasetKey & { snapshotId: number },
  checkpoints: readonly SliceCheckpoint[],
  skips: readonly SkipRow[],
): Promise<void> {
  const { runId, datasetId, snapshotId } = key;
  await tx.insert(officialImportRunSlices).values(checkpoints.map((checkpoint) => ({ runId, datasetId, snapshotId, ...checkpoint })));
  if (skips.length > 0) await tx.insert(officialImportRunSkips).values(skips.map((skip) => ({ runId, datasetId, ...skip })));
}

export async function markSlicesImported(tx: DbTx, datasetId: number, slices: readonly string[], snapshotId: number): Promise<void> {
  await tx
    .update(officialDatasetSlices)
    .set({ snapshotId, importedAt: sql`now()` })
    .where(and(eq(officialDatasetSlices.datasetId, datasetId), inArray(officialDatasetSlices.key, [...slices])));
}

export async function saveDatasetError(tx: DbTx, { runId, datasetId }: RunDatasetKey, error: string): Promise<void> {
  await tx
    .update(officialImportRunDatasets)
    .set({ error })
    .where(and(eq(officialImportRunDatasets.runId, runId), eq(officialImportRunDatasets.datasetId, datasetId)));
}
