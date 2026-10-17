import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { insertChanges } from "./changes.js";
import { markSlicesImported, readAppliedSnapshots, readApprovals, saveCheckpoints } from "./checkpoints.js";
import { DEFAULT_HOLD_SHRINK_PERCENT } from "./config.js";
import { fileDateOf } from "./fileDate.js";
import { decideSlice } from "./guard.js";
import { applyLinks, countLiveLinks, stageLinks } from "./links/apply.js";
import { readContextOf } from "./readContext.js";
import { inRunTransaction, touchHeartbeat } from "./runs.js";
import { applySites } from "./sites/apply.js";
import { countLiveListings, stageSites } from "./sites/staging.js";
import { type SkipCounts, countSkip, skipRows } from "./skips.js";
import type { ChangeInput, PreparedRelease, ReleaseInput, RunScope, SliceCount } from "./types.js";

async function isUnchanged(tx: DbTx, { scope, dataset, release, snapshotId }: ReleaseInput): Promise<boolean> {
  if (scope.run.kind === "replay") return false;

  const appliedSnapshots = await readAppliedSnapshots(tx, dataset.id, release.coveredSlices);
  return release.coveredSlices.every((slice) => appliedSnapshots.get(slice) === snapshotId);
}

async function countLive(tx: DbTx, { dataset, release }: ReleaseInput): Promise<Map<string, number>> {
  if (dataset.definition.layer === "sites") return countLiveListings(tx, dataset.id, release.coveredSlices);

  const linkCount = await countLiveLinks(tx, dataset.id);
  return new Map(release.coveredSlices.map((slice) => [slice, linkCount]));
}

async function checkpointUnchanged(tx: DbTx, input: ReleaseInput): Promise<void> {
  const { scope, dataset, release, snapshotId } = input;
  const liveCounts = await countLive(tx, input);

  await saveCheckpoints(
    tx,
    { runId: scope.run.id, datasetId: dataset.id, snapshotId },
    release.coveredSlices.map((slice) => {
      const liveCount = liveCounts.get(slice) ?? 0;
      return { slice, outcome: "unchanged", stagedCount: liveCount, liveCount };
    }),
    [],
  );
  logger.info("official.import.release_unchanged", { runId: scope.run.id, datasetKey: dataset.key, slices: release.coveredSlices });
}

async function settleRelease(
  tx: DbTx,
  { scope, dataset, release, snapshotId }: ReleaseInput,
  counts: readonly SliceCount[],
  skips: SkipCounts,
  apply: (appliedSlices: readonly string[]) => Promise<ChangeInput[]>,
): Promise<void> {
  const key = { runId: scope.run.id, datasetId: dataset.id };
  const described = { runId: scope.run.id, datasetKey: dataset.key };
  logger.info("official.import.staged", { ...described, slices: counts });
  const holdShrinkPercent = dataset.holdShrinkPercent ?? DEFAULT_HOLD_SHRINK_PERCENT;
  const approvals = await readApprovals(tx, key);
  const checkpoints = counts.map((count) => ({
    ...count,
    outcome: decideSlice({ ...count, holdShrinkPercent, isApproved: approvals.get(count.slice) === snapshotId }),
  }));
  for (const { slice, stagedCount, liveCount } of checkpoints.filter((checkpoint) => checkpoint.outcome === "held")) {
    const reason = stagedCount === 0 ? "nothing_staged" : "shrank";
    logger.info("official.import.held", { ...described, slice, stagedCount, liveCount, holdShrinkPercent, reason });
  }
  const appliedSlices = checkpoints.filter((checkpoint) => checkpoint.outcome === "applied").map((checkpoint) => checkpoint.slice);
  const changes = appliedSlices.length > 0 ? await apply(appliedSlices) : [];

  await saveCheckpoints(tx, { ...key, snapshotId }, checkpoints, skipRows(skips, release.coveredSlices));
  await insertChanges(tx, scope.run.id, changes);
  if (appliedSlices.length > 0) {
    await markSlicesImported(tx, dataset.id, appliedSlices, snapshotId);
    logger.info("official.import.applied", { ...described, slices: appliedSlices, changes: changes.length });
  }
}

async function stageAndSettle(tx: DbTx, input: ReleaseInput): Promise<void> {
  const { definition } = input.dataset;
  const skips: SkipCounts = new Map();
  const context = readContextOf(input.scope, input.dataset.key, (slice, reason) => countSkip(skips, slice, reason));

  if (definition.layer === "sites") {
    const counts = await stageSites(tx, input, definition, context, skips);
    await settleRelease(tx, input, counts, skips, (appliedSlices) => applySites(tx, input, definition, appliedSlices));
    return;
  }

  const staged = await stageLinks(tx, input, definition, context, skips);
  await settleRelease(tx, input, staged.counts, skips, () => applyLinks(tx, input, staged, skips));
}

export async function importRelease(scope: RunScope, prepared: PreparedRelease, snapshotId: number): Promise<void> {
  const input: ReleaseInput = { ...prepared, scope, snapshotId, fileDate: fileDateOf(prepared.release.publishedOn, scope.run.startedAt) };

  await inRunTransaction(scope, async (tx) => {
    if (await isUnchanged(tx, input)) await checkpointUnchanged(tx, input);
    else await stageAndSettle(tx, input);
    await touchHeartbeat(tx, scope.run.id);
  });
}
