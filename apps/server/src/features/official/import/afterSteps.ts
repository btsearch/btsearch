/* eslint-disable no-await-in-loop */
import type { OfficialSourceDefinition } from "@openbts/country-packs/sources";
import { officialImportRunSteps } from "@openbts/drizzle";
import { and, eq, sql } from "drizzle-orm";

import type { DbTx } from "../../../types/global.js";
import { errorMessage } from "../../../utils/errorMessage.js";
import { logger } from "../../../utils/logger.js";
import type { DirectoryArchive } from "./archive.js";
import { RunNotOwnedError, inRunTransaction } from "./runs.js";
import type { AfterStep, AfterStepContext, RunScope, RunStepName } from "./types.js";

type StepKey = { runId: string; step: RunStepName };
type StepProgress = { isFinished: boolean; lastSeq: number | null };

function stepCondition({ runId, step }: StepKey) {
  return and(eq(officialImportRunSteps.runId, runId), eq(officialImportRunSteps.step, step));
}

export async function hasStartedAfterSteps(reader: Pick<DbTx, "select">, runId: string): Promise<boolean> {
  const started = await reader
    .select({ step: officialImportRunSteps.step })
    .from(officialImportRunSteps)
    .where(eq(officialImportRunSteps.runId, runId));
  return started.length > 0;
}

async function startStep(tx: DbTx, key: StepKey): Promise<StepProgress> {
  const [stored] = await tx
    .select({ lastSeq: officialImportRunSteps.lastSeq, finishedAt: officialImportRunSteps.finishedAt })
    .from(officialImportRunSteps)
    .where(stepCondition(key))
    .limit(1);
  if (!stored) {
    await tx.insert(officialImportRunSteps).values({ ...key, startedAt: sql`now()` });
    return { isFinished: false, lastSeq: null };
  }
  if (stored.finishedAt !== null) return { isFinished: true, lastSeq: stored.lastSeq };

  await tx.update(officialImportRunSteps).set({ error: null }).where(stepCondition(key));
  return { isFinished: false, lastSeq: stored.lastSeq };
}

async function saveStepProgress(tx: DbTx, key: StepKey, lastSeq: number): Promise<void> {
  await tx.update(officialImportRunSteps).set({ lastSeq }).where(stepCondition(key));
}

async function finishStep(tx: DbTx, key: StepKey): Promise<void> {
  await tx
    .update(officialImportRunSteps)
    .set({ finishedAt: sql`COALESCE(${officialImportRunSteps.finishedAt}, now())` })
    .where(stepCondition(key));
}

async function saveStepError(tx: DbTx, key: StepKey, error: string): Promise<void> {
  await tx.update(officialImportRunSteps).set({ error }).where(stepCondition(key));
}

export function plannedAfterSteps(steps: readonly AfterStep[], source: OfficialSourceDefinition, isDryRun: boolean): AfterStep[] {
  return steps.filter((step) => (step.runsInDryRun || !isDryRun) && (step.appliesTo?.(source) ?? true));
}

export async function runAfterSteps(scope: RunScope, steps: readonly AfterStep[], archive: DirectoryArchive): Promise<void> {
  for (const step of steps) {
    const key = { runId: scope.run.id, step: step.name };
    const progress = await inRunTransaction(scope, (tx) => startStep(tx, key));
    if (progress.isFinished) continue;

    logger.info("official.import.step_started", key);
    const startedAt = Date.now();
    const saveError = (error: unknown) => inRunTransaction(scope, (tx) => saveStepError(tx, key, errorMessage(error)));
    const context: AfterStepContext = {
      run: scope.run,
      source: scope.source,
      archive,
      lastSeq: progress.lastSeq,
      transaction: (work) => inRunTransaction(scope, work),
      saveProgress: (tx, lastSeq) => saveStepProgress(tx, key, lastSeq),
      markFinished: (tx) => finishStep(tx, key),
      async recordError(error) {
        if (error instanceof RunNotOwnedError) throw error;

        logger.error(`official.import.${step.name}`, { runId: scope.run.id, error });
        await saveError(error);
      },
    };
    try {
      await step.perform(context);
    } catch (error) {
      if (error instanceof RunNotOwnedError) throw error;

      await saveError(error);
      throw new Error(`After-step ${step.name} failed: ${errorMessage(error)}`, { cause: error });
    }
    await inRunTransaction(scope, (tx) => finishStep(tx, key));
    logger.info("official.import.step_finished", { ...key, ms: Date.now() - startedAt });
  }
}
