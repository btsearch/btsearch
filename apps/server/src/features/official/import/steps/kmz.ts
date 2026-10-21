import db from "../../../../database/psql.js";
import type { DbTx } from "../../../../types/global.js";
import { logger } from "../../../../utils/logger.js";
import { hasEveryTechnicalColumn } from "../links/apply.js";
import type { AfterStep, AfterStepContext, ClaimedRun } from "../types.js";
import { isImportOrReplay, readDatasetOutcomes } from "./datasetOutcomes.js";

const DEFAULT_KMZ_DIRECTORY = "kmz_output";

async function readChangedDatasets(tx: DbTx, run: ClaimedRun): Promise<string[]> {
  const changed: string[] = [];
  for (const dataset of await readDatasetOutcomes(tx, run)) {
    if (dataset.appliedSlices.length === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    if (dataset.layer === "microwave_links" && !(await hasEveryTechnicalColumn(tx, dataset.datasetId))) continue;
    changed.push(dataset.key);
  }
  return changed;
}

async function perform(context: AfterStepContext): Promise<void> {
  const { run, source } = context;
  if (source.exportKmz === undefined || !isImportOrReplay(run)) return;

  const changedDatasets = await context.transaction((tx) => readChangedDatasets(tx, run));
  if (changedDatasets.length === 0) return;

  try {
    const day = run.startedAt.toISOString().slice(0, 10);
    const directory = process.env.KMZ_OUTPUT_DIR ?? DEFAULT_KMZ_DIRECTORY;
    const files = await source.exportKmz({ db, sourceId: run.sourceId, directory, day, changedDatasets });
    logger.info("official.import.kmz", { runId: run.id, day, changedDatasets, files: files.length });
  } catch (error) {
    await context.recordError(error);
  }
}

export const kmz: AfterStep = { name: "kmz", runsInDryRun: false, appliesTo: (source) => source.exportKmz !== undefined, perform };
