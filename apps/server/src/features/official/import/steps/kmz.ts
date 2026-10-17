import db from "../../../../database/psql.js";
import { logger } from "../../../../utils/logger.js";
import type { AfterStep, AfterStepContext } from "../types.js";
import { hasAppliedSlice, isImportOrReplay, readDatasetOutcomes } from "./datasetOutcomes.js";

const DEFAULT_KMZ_DIRECTORY = "kmz_output";

async function perform(context: AfterStepContext): Promise<void> {
  const { run, source } = context;
  if (source.exportKmz === undefined || !isImportOrReplay(run)) return;

  const datasets = await context.transaction((tx) => readDatasetOutcomes(tx, run));
  if (!hasAppliedSlice(datasets)) return;

  try {
    const day = run.startedAt.toISOString().slice(0, 10);
    const files = await source.exportKmz({ db, directory: process.env.KMZ_OUTPUT_DIR ?? DEFAULT_KMZ_DIRECTORY, day });
    logger.info("official.import.kmz", { runId: run.id, day, files: files.length });
  } catch (error) {
    await context.recordError(error);
  }
}

export const kmz: AfterStep = { name: "kmz", runsInDryRun: false, perform };
