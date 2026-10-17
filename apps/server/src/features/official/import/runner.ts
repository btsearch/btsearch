/* eslint-disable no-await-in-loop */
import db from "../../../database/psql.js";
import { logger } from "../../../utils/logger.js";
import { type DryRunEnd, type RunEnd, processDryRun, processRun } from "./run.js";
import { RunNotOwnedError, claimNextRun, inRunTransaction, readLeftoverRuns, releaseRun } from "./runs.js";
import type { ClaimedRun, ImportEnvironment } from "./types.js";

export type RunnerEngine = {
  claimNextRun(): Promise<ClaimedRun | null>;
  processRun(run: ClaimedRun, handedBack: AbortSignal): Promise<RunEnd>;
  processDryRun(run: ClaimedRun, handedBack: AbortSignal): Promise<DryRunEnd>;
  releaseRun(run: ClaimedRun): Promise<void>;
};
export type ImportRunner = { stop(): Promise<void> };

type InFlightRun = { run: ClaimedRun; handedBack: AbortController };

export const IDLE_WAIT_MS = 5_000;

export function runnerEngineOf(environment: ImportEnvironment): RunnerEngine {
  return {
    claimNextRun,
    processRun: (run, handedBack) => processRun(run, environment, handedBack),
    processDryRun: (run, handedBack) => processDryRun(run, environment, handedBack),
    releaseRun: (run) => inRunTransaction({ run, database: db }, (tx) => releaseRun(tx, run.id)),
  };
}

export async function logLeftoverRuns(): Promise<void> {
  for (const run of await readLeftoverRuns()) {
    logger.info("official.importer.waiting", {
      runId: run.id,
      source: run.sourceKey,
      heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
      claimableAt: run.claimableAt?.toISOString() ?? null,
    });
  }
}

function pause(durationMs: number, stopping: AbortSignal): Promise<void> {
  if (stopping.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const wake = (): void => {
      clearTimeout(timer);
      stopping.removeEventListener("abort", wake);
      resolve();
    };
    const timer = setTimeout(wake, durationMs);
    stopping.addEventListener("abort", wake);
  });
}

async function processClaimedRun(engine: RunnerEngine, { run, handedBack }: InFlightRun): Promise<void> {
  const described = { runId: run.id, source: run.sourceKey, kind: run.kind, isDryRun: run.isDryRun, attempt: run.attempt };
  logger.info("official.importer.claimed", described);
  const end = run.isDryRun ? (await engine.processDryRun(run, handedBack.signal)).end : await engine.processRun(run, handedBack.signal);
  logger.info("official.importer.ended", { ...described, end });
}

async function handBack(engine: RunnerEngine, run: ClaimedRun): Promise<void> {
  try {
    await engine.releaseRun(run);
    logger.info("official.importer.handed_back", { runId: run.id });
  } catch (error) {
    if (!(error instanceof RunNotOwnedError)) logger.error("official.importer.hand_back", { runId: run.id, error });
  }
}

export function startImportRunner(engine: RunnerEngine): ImportRunner {
  const stopping = new AbortController();
  let inFlight: InFlightRun | null = null;

  async function claimAndProcessRuns(): Promise<void> {
    while (!stopping.signal.aborted) {
      try {
        const run = await engine.claimNextRun();
        if (run === null) await pause(IDLE_WAIT_MS, stopping.signal);
        else if (stopping.signal.aborted) await handBack(engine, run);
        else {
          inFlight = { run, handedBack: new AbortController() };
          await processClaimedRun(engine, inFlight);
        }
      } catch (error) {
        logger.error("official.importer", { runId: inFlight?.run.id, error });
        await pause(IDLE_WAIT_MS, stopping.signal);
      } finally {
        inFlight = null;
      }
    }
  }

  const finished = claimAndProcessRuns();

  return {
    async stop() {
      if (!stopping.signal.aborted) {
        stopping.abort();
        if (inFlight !== null) {
          const { run, handedBack } = inFlight;
          await handBack(engine, run);
          handedBack.abort(new RunNotOwnedError(run.id));
        }
      }
      await finished;
    },
  };
}
