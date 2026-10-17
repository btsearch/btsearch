/* eslint-disable no-await-in-loop */
import { officialDatasets, officialImportRuns, officialSources } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { enqueueRun } from "./runs.js";

export type ScheduledDataset = { id: number; sourceId: number; checkEveryHours: number; nextCheckAt: Date | null };
type PlannedImport = { sourceId: number; datasets: { id: number; nextCheckAt: Date }[] };
type QueuedImport = { runId: string; sourceId: number; datasetIds: number[] };

const HOUR_MS = 60 * 60 * 1000;

export function isDue(dataset: ScheduledDataset, now: Date): boolean {
  return dataset.nextCheckAt === null || dataset.nextCheckAt.getTime() <= now.getTime();
}

export function nextCheckAfter({ nextCheckAt, checkEveryHours }: ScheduledDataset, now: Date): Date {
  const intervalMs = checkEveryHours * HOUR_MS;
  if (nextCheckAt === null) return new Date(now.getTime() + intervalMs);

  const missedChecks = Math.floor((now.getTime() - nextCheckAt.getTime()) / intervalMs);
  return new Date(nextCheckAt.getTime() + (missedChecks + 1) * intervalMs);
}

function planScheduledImports(datasets: readonly ScheduledDataset[], busySourceIds: ReadonlySet<number>, now: Date): PlannedImport[] {
  const due = datasets.filter((dataset) => isDue(dataset, now) && !busySourceIds.has(dataset.sourceId));

  return [...Map.groupBy(due, (dataset) => dataset.sourceId)].map(([sourceId, sourceDatasets]) => ({
    sourceId,
    datasets: sourceDatasets.map((dataset) => ({ id: dataset.id, nextCheckAt: nextCheckAfter(dataset, now) })),
  }));
}

async function readSourcesWithLiveImport(tx: DbTx, sourceIds: readonly number[]): Promise<Set<number>> {
  const rows = await tx
    .selectDistinct({ sourceId: officialImportRuns.sourceId })
    .from(officialImportRuns)
    .where(
      and(
        inArray(officialImportRuns.sourceId, [...sourceIds]),
        eq(officialImportRuns.kind, "import"),
        inArray(officialImportRuns.state, ["queued", "running"]),
      ),
    );

  return new Set(rows.map((row) => row.sourceId));
}

export async function queueDueImports(tx: DbTx, now = new Date()): Promise<QueuedImport[]> {
  const datasets = await tx
    .select({
      id: officialDatasets.id,
      sourceId: officialDatasets.sourceId,
      checkEveryHours: officialDatasets.checkEveryHours,
      nextCheckAt: officialDatasets.nextCheckAt,
    })
    .from(officialDatasets)
    .innerJoin(officialSources, eq(officialSources.id, officialDatasets.sourceId))
    .where(and(eq(officialSources.isEnabled, true), eq(officialDatasets.isEnabled, true)))
    .orderBy(officialDatasets.id)
    .for("no key update", { of: officialDatasets });
  const dueSourceIds = unique(datasets.filter((dataset) => isDue(dataset, now)).map((dataset) => dataset.sourceId));
  if (dueSourceIds.length === 0) return [];

  const busySourceIds = await readSourcesWithLiveImport(tx, dueSourceIds);
  const queued: QueuedImport[] = [];
  for (const planned of planScheduledImports(datasets, busySourceIds, now)) {
    const datasetIds = planned.datasets.map((dataset) => dataset.id);
    const runId = await enqueueRun(tx, {
      sourceId: planned.sourceId,
      kind: "import",
      trigger: "scheduled",
      isDryRun: false,
      datasetIds,
      requestedById: null,
      approvals: [],
    });
    for (const { id, nextCheckAt } of planned.datasets) await tx.update(officialDatasets).set({ nextCheckAt }).where(eq(officialDatasets.id, id));
    queued.push({ runId, sourceId: planned.sourceId, datasetIds });
  }

  return queued;
}

export async function scheduleDueImports(): Promise<void> {
  const queued = await db.transaction((tx) => queueDueImports(tx));
  for (const queuedImport of queued) logger.info("official.import.scheduled", queuedImport);
}
