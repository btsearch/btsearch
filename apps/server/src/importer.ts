import "dotenv/config";
import { officialSources } from "@openbts/country-packs/sources";
import { connectDatabase, sql as connection } from "@openbts/drizzle/db";
import { constants } from "node:os";

import redis from "./database/redis.js";
import { archiveFromEnvironment } from "./features/official/import/archive.js";
import { IMPORTER_TEMP_BUFFERS } from "./features/official/import/config.js";
import { saveDryRunReport } from "./features/official/import/dryRunReports.js";
import { type ImportRunner, logLeftoverRuns, runnerEngineOf, startImportRunner } from "./features/official/import/runner.js";
import { syncSources } from "./features/official/import/sourceSync.js";
import { afterSteps } from "./features/official/import/steps/index.js";
import { flushLogs, installProcessErrorHandlers, logger } from "./utils/logger.js";

const SIGNAL_EXIT_CODE_BASE = 128;

const importDatabase = connectDatabase({ temp_buffers: IMPORTER_TEMP_BUFFERS });

async function start(): Promise<ImportRunner> {
  const archive = archiveFromEnvironment();
  const synced = await syncSources(officialSources);
  logger.info("official.importer.started", { pid: process.pid, ...synced });
  await logLeftoverRuns();

  return startImportRunner(
    runnerEngineOf({ sources: officialSources, database: importDatabase.db, archive, steps: afterSteps, keepDryRunReport: saveDryRunReport }),
  );
}

async function failStart(error: unknown): Promise<never> {
  logger.error("official.importer.start_failed", { error });
  await flushLogs();
  process.exit(1);
}

installProcessErrorHandlers();
const runner = await start().catch(failStart);

async function stop(signal: NodeJS.Signals): Promise<void> {
  logger.info("official.importer.stopping", { signal });
  await runner.stop();
  await Promise.allSettled([connection.end(), importDatabase.sql.end(), redis.close()]);
  await flushLogs();
  process.exit(SIGNAL_EXIT_CODE_BASE + constants.signals[signal]);
}

process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));
