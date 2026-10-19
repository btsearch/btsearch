/* eslint-disable no-await-in-loop */
import type { OfficialSourceDefinition } from "@openbts/country-packs/sources";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import db from "../../../database/psql.js";
import { errorMessage } from "../../../utils/errorMessage.js";
import { logger } from "../../../utils/logger.js";
import { hasStartedAfterSteps, runAfterSteps } from "./afterSteps.js";
import { saveDatasetError } from "./checkpoints.js";
import { type RunDatasets, prepareReleases, readRunDatasets } from "./datasets.js";
import { correctLicenseeNames } from "./licensees.js";
import { importRelease } from "./release.js";
import { type RemapReport, remapLicensee } from "./remap/apply.js";
import { type DryRunReport, readReport } from "./report.js";
import { RunNotOwnedError, deleteRun, failRun, finishRun, inRunTransaction, startHeartbeat, touchHeartbeat } from "./runs.js";
import { recordRelease } from "./snapshots.js";
import { hasChangedNothing, readDatasetOutcomes } from "./steps/datasetOutcomes.js";
import type { ClaimedRun, ImportEnvironment, PreparedRelease, RunDataset, RunScope } from "./types.js";

export type RunEnd = "done" | "unchanged" | "failed" | "lost";
export type DryRunEnd = { end: "done"; report: DryRunReport } | { end: "failed"; error: string } | { end: "lost" };

type Session = { scope: RunScope; directory: string; close(): Promise<void> };

class DryRunRollback extends Error {
  readonly report: DryRunReport;

  constructor(report: DryRunReport) {
    super("The dry run rolls back what it wrote");
    this.report = report;
  }
}

function sourceOf(environment: ImportEnvironment, run: ClaimedRun): OfficialSourceDefinition {
  const source = environment.sources.find(({ key }) => key === run.sourceKey);
  if (!source) throw new Error(`The code has no source ${run.sourceKey}`);

  return source;
}

async function openSession(
  run: ClaimedRun,
  source: OfficialSourceDefinition,
  database: RunScope["database"],
  handedBack: AbortSignal | undefined,
): Promise<Session> {
  const directory = await mkdtemp(path.join(tmpdir(), `official-import-${run.id}-`));
  const ownership = new AbortController();
  const stopHeartbeat = startHeartbeat(run, (error) => ownership.abort(error));
  const signal = AbortSignal.any([ownership.signal, ...(handedBack ? [handedBack] : [])]);

  return {
    scope: { run, source, database, signal, siteNames: { written: 0, skipped: 0 } },
    directory,
    async close() {
      stopHeartbeat();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function failDataset(scope: RunScope, { id: datasetId, key: datasetKey }: Pick<RunDataset, "id" | "key">, error: unknown): Promise<void> {
  if (error instanceof RunNotOwnedError) throw error;
  scope.signal.throwIfAborted();

  logger.warn("official.import.dataset", { runId: scope.run.id, datasetId, datasetKey, error });
  await inRunTransaction(scope, (tx) => saveDatasetError(tx, { runId: scope.run.id, datasetId }, errorMessage(error)));
}

async function importDatasets(
  scope: RunScope,
  datasets: RunDatasets,
  releasesOf: (dataset: RunDataset) => Promise<PreparedRelease[]>,
): Promise<void> {
  for (const dataset of datasets.withoutReader) await failDataset(scope, dataset, new Error(`The code has no reader for the dataset ${dataset.key}`));

  for (const dataset of datasets.ready) {
    try {
      for (const prepared of await releasesOf(dataset)) {
        const snapshotId = await inRunTransaction(scope, (tx) => recordRelease(tx, scope.run.sourceId, prepared));
        await importRelease(scope, prepared, snapshotId);
      }
    } catch (error) {
      await failDataset(scope, dataset, error);
    }
  }
}

function applyRemap(scope: RunScope): Promise<RemapReport> {
  return inRunTransaction(scope, async (tx) => {
    const report = await remapLicensee(tx, scope.run);
    await touchHeartbeat(tx, scope.run.id);
    return report;
  });
}

function forgetUnchangedImport(scope: RunScope): Promise<boolean> {
  return inRunTransaction(scope, async (tx) => {
    if (!hasChangedNothing(await readDatasetOutcomes(tx, scope.run))) return false;

    await deleteRun(tx, scope.run.id);
    logger.info("official.import.nothing_changed", { runId: scope.run.id });
    return true;
  });
}

async function endFailedRun(run: ClaimedRun, error: unknown): Promise<"failed" | "lost"> {
  if (error instanceof RunNotOwnedError) return "lost";

  logger.error("official.import", { runId: run.id, error });
  try {
    await inRunTransaction({ run, database: db }, (tx) => failRun(tx, run.id, errorMessage(error)));
    return "failed";
  } catch (failure) {
    if (failure instanceof RunNotOwnedError) return "lost";
    throw failure;
  }
}

export async function processRun(run: ClaimedRun, environment: ImportEnvironment, handedBack?: AbortSignal): Promise<RunEnd> {
  if (run.isDryRun) throw new Error(`Import run ${run.id} is a dry run`);

  let session: Session | undefined;
  try {
    session = await openSession(run, sourceOf(environment, run), environment.database, handedBack);
    const { scope, directory } = session;
    const workspace = { scope, archive: environment.archive, directory };

    const resumesAtAfterSteps = run.attempt > 1 && (await hasStartedAfterSteps(db, run.id));
    if (!resumesAtAfterSteps) {
      if (run.kind === "remap") await applyRemap(scope);
      await importDatasets(scope, await readRunDatasets(db, run.id, scope.source), (dataset) => prepareReleases(db, workspace, dataset));
      if (run.kind === "import" && (await forgetUnchangedImport(scope))) return "unchanged";
    }
    await runAfterSteps(scope, environment.steps, environment.archive);
    await inRunTransaction(scope, (tx) => finishRun(tx, run.id));
    return "done";
  } catch (error) {
    return await endFailedRun(run, error);
  } finally {
    await session?.close();
  }
}

function reportOfRollback(error: unknown): DryRunReport {
  if (error instanceof DryRunRollback) return error.report;
  throw error;
}

async function rehearse(scope: RunScope, environment: ImportEnvironment, directory: string): Promise<DryRunReport> {
  const { run, source } = scope;
  const workspace = { scope, archive: environment.archive, directory };
  const datasets = await readRunDatasets(db, run.id, source);
  const preparedBeforeTransaction = new Map<number, Promise<PreparedRelease[]>>();
  for (const dataset of datasets.ready) {
    const preparing = prepareReleases(db, workspace, dataset);
    await Promise.allSettled([preparing]);
    preparedBeforeTransaction.set(dataset.id, preparing);
  }

  return inRunTransaction(scope, async (tx): Promise<DryRunReport> => {
    const transactionScope: RunScope = { ...scope, database: tx };
    const licenseeNamesCorrected = await correctLicenseeNames(tx, run.sourceId, source.shortLicenseeName);
    const remap = run.kind === "remap" ? await applyRemap(transactionScope) : null;
    await importDatasets(transactionScope, datasets, (dataset) => preparedBeforeTransaction.get(dataset.id) ?? Promise.resolve([]));
    await runAfterSteps(
      transactionScope,
      environment.steps.filter((step) => step.runsInDryRun),
      environment.archive,
    );

    throw new DryRunRollback(await readReport(tx, run.id, { siteNames: scope.siteNames, licenseeNamesCorrected, remap }));
  }).catch(reportOfRollback);
}

export async function processDryRun(run: ClaimedRun, environment: ImportEnvironment, handedBack?: AbortSignal): Promise<DryRunEnd> {
  if (!run.isDryRun) throw new Error(`Import run ${run.id} is not a dry run`);

  let session: Session | undefined;
  try {
    session = await openSession(run, sourceOf(environment, run), environment.database, handedBack);
    const report = await rehearse(session.scope, environment, session.directory);
    await environment.keepDryRunReport(run.id, report);
    await inRunTransaction(session.scope, (tx) => finishRun(tx, run.id));
    return { end: "done", report };
  } catch (error) {
    const end = await endFailedRun(run, error);
    return end === "lost" ? { end } : { end, error: errorMessage(error) };
  } finally {
    await session?.close();
  }
}
