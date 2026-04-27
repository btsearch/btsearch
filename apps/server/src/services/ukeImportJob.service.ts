import { deletedEntries, stations, ukePermits, ukeRadiolines } from "@openbts/drizzle";
import { associateStationsWithPermits } from "@openbts/uke-importer/stations";
import { cleanupDownloads } from "@openbts/uke-importer/utils";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { db } from "../database/psql.js";
import redis from "../database/redis.js";
import { logger } from "../utils/logger.js";
import { notifyUkeUpdate } from "./notification.service.js";
import { cleanupOrphanedUkeLocations, pruneStationsPermits } from "./stationsPermitsAssociation.service.js";
import { getSnapshotDelta, takeStatsSnapshot } from "./statsSnapshot.service.js";

type ImportStepKey =
  | "permits"
  | "radiolines"
  | "device_registry"
  | "prune_deleted_entries"
  | "prune_associations"
  | "cleanup_orphaned_uke_locations"
  | "associate"
  | "snapshot"
  | "cleanup";
type StepStatus = "pending" | "running" | "success" | "skipped" | "error";
type JobState = "idle" | "running" | "success" | "error";

interface ImportStep {
  key: ImportStepKey;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
}

interface ImportJobStatus {
  state: JobState;
  startedAt?: string;
  finishedAt?: string;
  steps: ImportStep[];
  error?: string;
}

interface ImportDelta {
  stations: { added: number };
  permits: { added: number; updated: number; deleted: number };
  radiolines: { added: number; deleted: number };
}

const IMPORT_COMPLETE_CHANNEL = "uke:import:complete";

async function computeImportDelta(startedAt: string): Promise<ImportDelta> {
  const since = new Date(startedAt);
  since.setUTCHours(0, 0, 0, 0);

  const deletedSince = new Date(startedAt);

  const [stationsAdded, permitsAdded, permitsUpdated, permitsDeleted, radiolinesAdded, radiolinesDeleted] = await Promise.all([
    db.select({ count: count() }).from(stations).where(gte(stations.createdAt, since)),
    db.select({ count: count() }).from(ukePermits).where(gte(ukePermits.createdAt, since)),
    db
      .select({ count: count() })
      .from(ukePermits)
      .where(and(gte(ukePermits.updatedAt, since), lt(ukePermits.createdAt, since))),
    db
      .select({ count: count() })
      .from(deletedEntries)
      .where(and(eq(deletedEntries.source_table, "uke_permits"), gte(deletedEntries.deleted_at, deletedSince))),
    db.select({ count: count() }).from(ukeRadiolines).where(gte(ukeRadiolines.createdAt, since)),
    db
      .select({ count: count() })
      .from(deletedEntries)
      .where(and(eq(deletedEntries.source_table, "uke_radiolines"), gte(deletedEntries.deleted_at, deletedSince))),
  ]);

  return {
    stations: { added: stationsAdded[0]?.count ?? 0 },
    permits: {
      added: permitsAdded[0]?.count ?? 0,
      updated: permitsUpdated[0]?.count ?? 0,
      deleted: permitsDeleted[0]?.count ?? 0,
    },
    radiolines: {
      added: radiolinesAdded[0]?.count ?? 0,
      deleted: radiolinesDeleted[0]?.count ?? 0,
    },
  };
}

const STEP_KEYS: ImportStepKey[] = [
  "permits",
  "radiolines",
  "device_registry",
  "prune_deleted_entries",
  "prune_associations",
  "cleanup_orphaned_uke_locations",
  "associate",
  "snapshot",
  "cleanup",
];

const DELETED_ENTRIES_RETENTION_DAYS = Number(process.env.DELETED_ENTRIES_RETENTION_DAYS) || 180;
const REDIS_KEY = "uke:import:status";
const REDIS_LOCK_KEY = "uke:import:lock";
const LOCK_TTL_SECONDS = 3600;

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "..", "workers", "ukeImport.worker.js");

function makeSteps(): ImportStep[] {
  return STEP_KEYS.map((key) => ({ key, status: "pending" }));
}

async function loadJob(): Promise<ImportJobStatus> {
  const raw = await redis.get(REDIS_KEY);
  if (!raw) return { state: "idle", steps: [] };
  return JSON.parse(raw) as ImportJobStatus;
}

async function saveJob(job: ImportJobStatus): Promise<void> {
  await redis.set(REDIS_KEY, JSON.stringify(job));
}

function updateStep(job: ImportJobStatus, key: ImportStepKey, update: Partial<ImportStep>): void {
  const step = job.steps.find((s) => s.key === key);
  if (step) Object.assign(step, update);
}

function markRunning(job: ImportJobStatus, key: ImportStepKey): void {
  updateStep(job, key, { status: "running", startedAt: new Date().toISOString() });
}

function markSuccess(job: ImportJobStatus, key: ImportStepKey): void {
  updateStep(job, key, { status: "success", finishedAt: new Date().toISOString() });
}

function markSkipped(job: ImportJobStatus, key: ImportStepKey): void {
  updateStep(job, key, { status: "skipped", finishedAt: new Date().toISOString() });
}

function markError(job: ImportJobStatus, key: ImportStepKey): void {
  updateStep(job, key, { status: "error", finishedAt: new Date().toISOString() });
}

function runInWorker(task: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { task },
      execArgv: process.execArgv,
    });

    worker.on("message", (msg: { success: boolean; result?: boolean; error?: string }) => {
      if (msg.success) {
        resolve(msg.result ?? false);
      } else {
        reject(new Error(msg.error ?? "Worker task failed"));
      }
    });

    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

export async function getImportJobStatus(): Promise<ImportJobStatus> {
  const job = await loadJob();
  return { ...job, steps: job.steps.map((s) => ({ ...s })) };
}

export async function startImportJob(options: {
  importPermits?: boolean;
  importRadiolines?: boolean;
  importDeviceRegistry?: boolean;
}): Promise<ImportJobStatus> {
  const acquired = await redis.set(REDIS_LOCK_KEY, "1", { expiration: { type: "EX", value: LOCK_TTL_SECONDS }, condition: "NX" });
  if (!acquired) return getImportJobStatus();

  const job: ImportJobStatus = {
    state: "running",
    startedAt: new Date().toISOString(),
    steps: makeSteps(),
  };
  await saveJob(job);

  setImmediate(() => runJob(job, options));
  return { ...job, steps: job.steps.map((s) => ({ ...s })) };
}

async function runJob(
  job: ImportJobStatus,
  options: { importPermits?: boolean; importRadiolines?: boolean; importDeviceRegistry?: boolean },
): Promise<void> {
  const {
    importPermits: shouldImportPermits = true,
    importRadiolines: shouldImportRadiolines = false,
    importDeviceRegistry: shouldImportDeviceRegistry = true,
  } = options;

  let permitsChanged = false;
  let radiolinesChanged = false;
  let deviceRegistryChanged = false;

  try {
    if (shouldImportPermits) {
      markRunning(job, "permits");
      await saveJob(job);
      try {
        permitsChanged = await runInWorker("importPermits");
        if (permitsChanged) markSuccess(job, "permits");
        else markSkipped(job, "permits");
        await saveJob(job);
      } catch (e) {
        markError(job, "permits");
        await saveJob(job);
        throw e;
      }
    } else {
      markSkipped(job, "permits");
      await saveJob(job);
    }

    if (shouldImportRadiolines) {
      markRunning(job, "radiolines");
      await saveJob(job);
      try {
        radiolinesChanged = await runInWorker("importRadiolines");
        if (radiolinesChanged) markSuccess(job, "radiolines");
        else markSkipped(job, "radiolines");
        await saveJob(job);
      } catch (e) {
        markError(job, "radiolines");
        await saveJob(job);
        throw e;
      }
    } else {
      markSkipped(job, "radiolines");
      await saveJob(job);
    }

    if (shouldImportDeviceRegistry) {
      markRunning(job, "device_registry");
      await saveJob(job);
      try {
        deviceRegistryChanged = await runInWorker("importDeviceRegistry");
        if (deviceRegistryChanged) markSuccess(job, "device_registry");
        else markSkipped(job, "device_registry");
        await saveJob(job);
      } catch (e) {
        markError(job, "device_registry");
        await saveJob(job);
        throw e;
      }
    } else {
      markSkipped(job, "device_registry");
      await saveJob(job);
    }

    markRunning(job, "prune_deleted_entries");
    await saveJob(job);
    try {
      const cutoff = new Date(Date.now() - DELETED_ENTRIES_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const pruned = await db.delete(deletedEntries).where(lt(deletedEntries.deleted_at, cutoff)).returning({ id: deletedEntries.id });
      logger.info(`Pruned ${pruned.length} deleted entries older than ${DELETED_ENTRIES_RETENTION_DAYS} days`);
      markSuccess(job, "prune_deleted_entries");
      await saveJob(job);
    } catch (e) {
      markError(job, "prune_deleted_entries");
      await saveJob(job);
      throw e;
    }

    if (permitsChanged || deviceRegistryChanged) {
      markRunning(job, "cleanup_orphaned_uke_locations");
      await saveJob(job);
      try {
        await cleanupOrphanedUkeLocations();
        markSuccess(job, "cleanup_orphaned_uke_locations");
        await saveJob(job);
      } catch (e) {
        markError(job, "cleanup_orphaned_uke_locations");
        await saveJob(job);
        throw e;
      }

      markRunning(job, "prune_associations");
      await saveJob(job);
      try {
        await pruneStationsPermits();
        markSuccess(job, "prune_associations");
        await saveJob(job);
      } catch (e) {
        markError(job, "prune_associations");
        await saveJob(job);
        throw e;
      }

      markRunning(job, "associate");
      await saveJob(job);
      try {
        await associateStationsWithPermits();
        markSuccess(job, "associate");
        await saveJob(job);
      } catch (e) {
        markError(job, "associate");
        await saveJob(job);
        throw e;
      }
    } else {
      markSkipped(job, "cleanup_orphaned_uke_locations");
      markSkipped(job, "prune_associations");
      markSkipped(job, "associate");
      await saveJob(job);
    }

    if (permitsChanged || deviceRegistryChanged) {
      markRunning(job, "snapshot");
      await saveJob(job);
      try {
        await takeStatsSnapshot();
        markSuccess(job, "snapshot");
        await saveJob(job);
      } catch (e) {
        markError(job, "snapshot");
        await saveJob(job);
        logger.error("Stats snapshot failed", { error: e instanceof Error ? e.message : String(e) });
      }
    } else {
      markSkipped(job, "snapshot");
      await saveJob(job);
    }

    job.state = "success";
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
    if (permitsChanged || radiolinesChanged || deviceRegistryChanged) {
      notifyUkeUpdate().catch((e) => logger.error("Failed to send UKE update notifications", { error: e instanceof Error ? e.message : String(e) }));
      Promise.all([computeImportDelta(job.startedAt!), getSnapshotDelta().catch(() => null)])
        .then(([delta, snapshotDelta]) =>
          redis.publish(
            IMPORT_COMPLETE_CHANNEL,
            JSON.stringify({ state: "success", startedAt: job.startedAt, finishedAt: job.finishedAt, delta, snapshotDelta }),
          ),
        )
        .catch((e) => logger.error("Failed to publish import complete event", { error: e instanceof Error ? e.message : String(e) }));
    }
  } catch (e) {
    job.state = "error";
    job.finishedAt = new Date().toISOString();
    job.error = e instanceof Error ? e.message : String(e);
    await saveJob(job);
    logger.error("UKE import job failed", { error: job.error });
  } finally {
    markRunning(job, "cleanup");
    await saveJob(job);
    try {
      await cleanupDownloads();
      markSuccess(job, "cleanup");
    } catch (e) {
      markError(job, "cleanup");
      logger.error("Failed to cleanup downloads", { error: e instanceof Error ? e.message : String(e) });
    }
    await saveJob(job);
    await redis.del(REDIS_LOCK_KEY);
  }
}
