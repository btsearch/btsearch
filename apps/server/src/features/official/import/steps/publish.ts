import type { DatasetDefinition } from "@openbts/country-packs/sources";
import { officialImportRuns } from "@openbts/drizzle";
import type { ImportRunTrigger } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";

import redis from "../../../../database/redis.js";
import type { DbTx } from "../../../../types/global.js";
import { type SnapshotDelta, getSnapshotDelta } from "../../../stats/permitsSnapshot.js";
import { tallyChanges, toChangeCounts } from "../../importRuns.js";
import { type ChangeCount, countChanges } from "../changes.js";
import type { AfterStep, AfterStepContext, ClaimedRun } from "../types.js";
import {
  type DatasetOutcome,
  hasAppliedSlice,
  hasFailedDataset,
  isImportOrReplay,
  readDatasetOutcomes,
  takesStatsSnapshot,
} from "./datasetOutcomes.js";

type PublishedRun = Pick<ClaimedRun, "id" | "sourceKey" | "startedAt">;
type SourceDatasets = { datasets: readonly Pick<DatasetDefinition, "key">[] };

export type RunView = {
  trigger: ImportRunTrigger;
  datasets: DatasetOutcome[];
  changeCounts: Pick<ChangeCount, "kind" | "count">[];
};

const COMPLETE_CHANNEL = "official:import:complete";

function definitionPosition(source: SourceDatasets, { key }: DatasetOutcome): number {
  const position = source.datasets.findIndex((dataset) => dataset.key === key);
  return position < 0 ? source.datasets.length : position;
}

function outcomeOf(dataset: DatasetOutcome): "applied" | "held" | "failed" | "skipped" {
  if (dataset.error !== null) return "failed";
  if (dataset.appliedSlices.length > 0) return "applied";
  return dataset.heldSlices.length > 0 ? "held" : "skipped";
}

export function importCompletionOf(
  run: PublishedRun,
  source: SourceDatasets,
  view: RunView,
  finishedAt: string,
  snapshotDelta: SnapshotDelta | null,
) {
  return {
    runId: run.id,
    sourceKey: run.sourceKey,
    trigger: view.trigger,
    startedAt: run.startedAt.toISOString(),
    finishedAt,
    datasets: view.datasets
      .toSorted((first, second) => definitionPosition(source, first) - definitionPosition(source, second))
      .map((dataset) => ({ key: dataset.key, outcome: outcomeOf(dataset), heldSlices: dataset.heldSlices, error: dataset.error })),
    changes: toChangeCounts(tallyChanges(view.changeCounts.map(({ kind, count }) => ({ kind, changes: count })))),
    snapshotDelta,
  };
}

async function readRunView(tx: DbTx, run: Pick<ClaimedRun, "id" | "sourceId">): Promise<RunView> {
  const [stored] = await tx
    .select({ trigger: officialImportRuns.trigger })
    .from(officialImportRuns)
    .where(eq(officialImportRuns.id, run.id))
    .limit(1);
  if (!stored) throw new Error(`Import run ${run.id} does not exist`);

  const datasets = await readDatasetOutcomes(tx, run);
  const changeCounts = await countChanges(tx, run.id);

  return { trigger: stored.trigger, datasets, changeCounts };
}

async function readSnapshotDelta(context: AfterStepContext): Promise<SnapshotDelta | null> {
  try {
    return await getSnapshotDelta();
  } catch (error) {
    await context.recordError(error);
    return null;
  }
}

async function perform(context: AfterStepContext): Promise<void> {
  const { run, source } = context;
  if (!isImportOrReplay(run)) return;

  const view = await context.transaction((tx) => readRunView(tx, run));
  const finishedAt = new Date().toISOString();
  const snapshotDelta = takesStatsSnapshot(view.datasets) ? await readSnapshotDelta(context) : null;

  if (hasAppliedSlice(view.datasets) || hasFailedDataset(view.datasets)) {
    const completion = importCompletionOf(run, source, view, finishedAt, snapshotDelta);
    await redis.publish(COMPLETE_CHANNEL, JSON.stringify(completion));
  }

  await context.transaction((tx) => context.markFinished(tx));
}

export const publish: AfterStep = { name: "publish", runsInDryRun: false, perform };
