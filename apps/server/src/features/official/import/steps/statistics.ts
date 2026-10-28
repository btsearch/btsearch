import { OfficialChange } from "@openbts/drizzle";

import redis from "../../../../database/redis.js";
import type { DbTx } from "../../../../types/global.js";
import { takeMicrowaveLinkSnapshot } from "../../../stats/microwaveLinks/store.js";
import { takeStatsSnapshot } from "../../../stats/permitsSnapshot.js";
import { BAND_LABEL_CACHE_KEY } from "../../bandLabels.js";
import { readChanges } from "../changes.js";
import type { AfterStep, AfterStepContext, ClaimedRun } from "../types.js";
import {
  type DatasetOutcome,
  hasAppliedSlice,
  hasFailedDataset,
  readDatasetOutcomes,
  takesMicrowaveLinkSnapshot,
  takesStatsSnapshot,
} from "./datasetOutcomes.js";

type StatisticsWork = { takesStatsSnapshot: boolean; takesMicrowaveLinkSnapshot: boolean; purgesCache: boolean };

const STATISTICS_CACHE_PATTERNS = ["statistics:v2:*", `${BAND_LABEL_CACHE_KEY}*`];

export function purgesStatisticsCache(datasets: readonly DatasetOutcome[]): boolean {
  return hasAppliedSlice(datasets) || hasFailedDataset(datasets, "sites");
}

async function findStatisticsCacheKeyBatches(pattern: string): Promise<string[][]> {
  const keyBatches: string[][] = [];

  for await (const keys of redis.scanIterator({ MATCH: pattern })) {
    if (keys.length > 0) keyBatches.push(keys);
  }

  return keyBatches;
}

async function purgeStatisticsCache(): Promise<void> {
  const keyBatches = (await Promise.all(STATISTICS_CACHE_PATTERNS.map(findStatisticsCacheKeyBatches))).flat();
  await Promise.all(keyBatches.map((keys) => redis.del(keys)));
}

async function readWork(tx: DbTx, run: Pick<ClaimedRun, "id" | "sourceId" | "kind">): Promise<StatisticsWork> {
  if (run.kind === "remap") {
    const [firstChange] = await readChanges(tx, run.id, { afterSeq: null, kinds: OfficialChange.enumValues, limit: 1 });
    const hasChanges = firstChange !== undefined;
    return { takesStatsSnapshot: hasChanges, takesMicrowaveLinkSnapshot: false, purgesCache: hasChanges };
  }

  const datasets = await readDatasetOutcomes(tx, run);
  return {
    takesStatsSnapshot: takesStatsSnapshot(datasets),
    takesMicrowaveLinkSnapshot: takesMicrowaveLinkSnapshot(datasets),
    purgesCache: purgesStatisticsCache(datasets),
  };
}

async function takeSnapshot(context: AfterStepContext, take: (tx: DbTx) => Promise<unknown>): Promise<void> {
  try {
    await context.transaction(take);
  } catch (error) {
    await context.recordError(error);
  }
}

async function perform(context: AfterStepContext): Promise<void> {
  if (context.run.kind === "relink") return;

  const work = await context.transaction((tx) => readWork(tx, context.run));
  if (work.takesStatsSnapshot) await takeSnapshot(context, (tx) => takeStatsSnapshot(tx));
  if (work.takesMicrowaveLinkSnapshot) await takeSnapshot(context, (tx) => takeMicrowaveLinkSnapshot(tx, context.run.sourceId));

  if (work.purgesCache) await purgeStatisticsCache();
}

export const statistics: AfterStep = { name: "statistics", runsInDryRun: false, perform };
