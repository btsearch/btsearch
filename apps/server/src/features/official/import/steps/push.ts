import { LEGACY_COUNTRY_CODE } from "../../../../constants.js";
import { notifyOfficialDataUpdate } from "../../../notifications/service.js";
import type { AfterStep, AfterStepContext } from "../types.js";
import { hasAppliedSlice, isImportOrReplay, readDatasetOutcomes } from "./datasetOutcomes.js";

async function perform(context: AfterStepContext): Promise<void> {
  const { run, source } = context;
  const announcesNewData = isImportOrReplay(run) && source.countryCode === LEGACY_COUNTRY_CODE;

  const isPushDue = await context.transaction(async (tx) => {
    const hasNewData = announcesNewData && hasAppliedSlice(await readDatasetOutcomes(tx, run));
    await context.markFinished(tx);
    return hasNewData;
  });
  if (!isPushDue) return;

  try {
    await notifyOfficialDataUpdate(source.shortName);
  } catch (error) {
    await context.recordError(error);
  }
}

export const push: AfterStep = { name: "push", runsInDryRun: false, perform };
