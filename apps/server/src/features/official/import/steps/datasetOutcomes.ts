import { officialDatasets, officialImportRunDatasets, officialImportRunSlices } from "@openbts/drizzle";
import { asc, eq } from "drizzle-orm";

import type { DbTx } from "../../../../types/global.js";
import type { ClaimedRun, SliceOutcome } from "../types.js";

type StoredDataset = { datasetId: number; key: string; layer: "sites" | "microwave_links" };
type RunDatasetError = { datasetId: number; error: string | null };
type RunSliceRow = { datasetId: number; slice: string; outcome: SliceOutcome };

export type DatasetOutcome = StoredDataset & { error: string | null; appliedSlices: string[]; heldSlices: string[] };

export function datasetOutcomesOf(
  datasets: readonly StoredDataset[],
  runDatasets: readonly RunDatasetError[],
  runSlices: readonly RunSliceRow[],
): DatasetOutcome[] {
  return datasets.map((dataset) => {
    const runDataset = runDatasets.find(({ datasetId }) => datasetId === dataset.datasetId);
    const slicesWith = (outcome: SliceOutcome) =>
      runSlices.filter((slice) => slice.datasetId === dataset.datasetId && slice.outcome === outcome).map(({ slice }) => slice);

    return { ...dataset, error: runDataset?.error ?? null, appliedSlices: slicesWith("applied"), heldSlices: slicesWith("held") };
  });
}

export async function readDatasetOutcomes(tx: Pick<DbTx, "select">, run: Pick<ClaimedRun, "id" | "sourceId">): Promise<DatasetOutcome[]> {
  const datasets = await tx
    .select({ datasetId: officialDatasets.id, key: officialDatasets.key, layer: officialDatasets.layer })
    .from(officialDatasets)
    .where(eq(officialDatasets.sourceId, run.sourceId))
    .orderBy(asc(officialDatasets.key));
  const runDatasets = await tx
    .select({ datasetId: officialImportRunDatasets.datasetId, error: officialImportRunDatasets.error })
    .from(officialImportRunDatasets)
    .where(eq(officialImportRunDatasets.runId, run.id));
  const runSlices = await tx
    .select({ datasetId: officialImportRunSlices.datasetId, slice: officialImportRunSlices.slice, outcome: officialImportRunSlices.outcome })
    .from(officialImportRunSlices)
    .where(eq(officialImportRunSlices.runId, run.id))
    .orderBy(asc(officialImportRunSlices.datasetId), asc(officialImportRunSlices.slice));

  return datasetOutcomesOf(datasets, runDatasets, runSlices);
}

export function isImportOrReplay(run: Pick<ClaimedRun, "kind">): boolean {
  return run.kind === "import" || run.kind === "replay";
}

export function hasAppliedSlice(datasets: readonly DatasetOutcome[], layer?: DatasetOutcome["layer"]): boolean {
  return datasets.some((dataset) => (layer === undefined || dataset.layer === layer) && dataset.appliedSlices.length > 0);
}

export function hasFailedDataset(datasets: readonly DatasetOutcome[], layer?: DatasetOutcome["layer"]): boolean {
  return datasets.some((dataset) => (layer === undefined || dataset.layer === layer) && dataset.error !== null);
}

export function takesStatsSnapshot(datasets: readonly DatasetOutcome[]): boolean {
  return hasAppliedSlice(datasets, "sites") && !hasFailedDataset(datasets, "sites");
}
