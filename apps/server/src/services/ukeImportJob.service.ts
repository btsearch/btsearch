import { deletedEntries, locations, stations, stationsPermits, ukeLocations, ukePermits, ukeRadiolines, ukeStations } from "@openbts/drizzle";
import { associateStationsWithPermits } from "@openbts/uke-importer/stations";
import { cleanupDownloads } from "@openbts/uke-importer/utils";
import { and, count, eq, gt, gte, inArray, lt, lte, max, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { db } from "../database/psql.js";
import redis from "../database/redis.js";
import { errorMessage } from "../utils/errorMessage.js";
import { logger } from "../utils/logger.js";
import { buildInternalStationActionUrl, buildMapLocationActionUrl, buildUkeStationActionUrl } from "./notifications/actionUrls.js";
import { notifyStationWatchers, notifyUkeStationWatchers, notifyUkeUpdate } from "./notifications/service.js";
import { cleanupOrphanedUkeLocations, cleanupOrphanedUkeStations, pruneStationsPermits } from "./stationsPermitsAssociation.service.js";
import { getSnapshotDelta, takeStatsSnapshot } from "./statsSnapshot.service.js";
import { IMPORT_STEP_KEYS, type ImportJobStatus, type ImportStep, type ImportStepKey, type ImportTrigger } from "./ukeImport/schemas.js";
import {
  type ImportWorkerTask,
  SOURCE_IMPORT_STEP_KEYS,
  type SourceImportStepKey,
  type SourceImportStepStatus,
  runSourceImportStep,
} from "./ukeImportSourceStep.js";

type HistoryJob = ImportJobStatus & { id: string; startedAt: string };
type ImportJob = HistoryJob & { trigger: ImportTrigger };

interface ImportOptions {
  importPermits?: boolean;
  importRadiolines?: boolean;
  importDeviceRegistry?: boolean;
}

interface ImportBaseline {
  permitId: number;
  stationId: number;
  radiolineId: number;
}

class ImportStepError extends Error {}

interface ImportDelta {
  stations: { added: number };
  permits: { added: number; updated: number; deleted: number };
  radiolines: { added: number; deleted: number };
}

interface PermitStationAssociation {
  permitId: number;
  stationId: number;
}

const IMPORT_COMPLETE_CHANNEL = "uke:import:complete";

async function loadImportBaseline(): Promise<ImportBaseline> {
  const [[permits], [stations], [radiolines]] = await Promise.all([
    db.select({ id: max(ukePermits.id) }).from(ukePermits),
    db.select({ id: max(ukeStations.id) }).from(ukeStations),
    db.select({ id: max(ukeRadiolines.id) }).from(ukeRadiolines),
  ]);
  return { permitId: permits?.id ?? 0, stationId: stations?.id ?? 0, radiolineId: radiolines?.id ?? 0 };
}

async function computeImportDelta(baseline: ImportBaseline, startedAt: string): Promise<ImportDelta> {
  const since = new Date(startedAt);

  const [stationsAdded, permitsAdded, permitsUpdated, permitsDeleted, radiolinesAdded, radiolinesDeleted] = await Promise.all([
    db.select({ count: count() }).from(ukeStations).where(gt(ukeStations.id, baseline.stationId)),
    db.select({ count: count() }).from(ukePermits).where(gt(ukePermits.id, baseline.permitId)),
    db
      .select({ count: count() })
      .from(ukePermits)
      .where(and(gte(ukePermits.updatedAt, since), lte(ukePermits.id, baseline.permitId))),
    db
      .select({ count: count() })
      .from(deletedEntries)
      .where(and(eq(deletedEntries.source_table, "uke_permits"), gte(deletedEntries.deleted_at, since))),
    db.select({ count: count() }).from(ukeRadiolines).where(gt(ukeRadiolines.id, baseline.radiolineId)),
    db
      .select({ count: count() })
      .from(deletedEntries)
      .where(and(eq(deletedEntries.source_table, "uke_radiolines"), gte(deletedEntries.deleted_at, since))),
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

const DELETED_ENTRIES_RETENTION_DAYS = Number(process.env.DELETED_ENTRIES_RETENTION_DAYS) || 180;
const REDIS_KEY = "uke:import:status";
const REDIS_LOCK_KEY = "uke:import:lock";
const LOCK_TTL_SECONDS = 3600;
const LOCK_RENEW_INTERVAL_MS = 60_000;
const MAX_IMPORT_DURATION_MS = 3 * 60 * 60 * 1000;
const WORKER_TIMEOUT_MS = 60 * 60 * 1000;
const INTERRUPTED_JOB_ERROR = "Import was interrupted before it finished";
const SOURCE_STEP_KEYS = new Set<ImportStepKey>(SOURCE_IMPORT_STEP_KEYS);
const HISTORY_KEY = "uke:import:history";
const HISTORY_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const HISTORY_RETENTION_MS = HISTORY_RETENTION_SECONDS * 1000;
const STATISTICS_CACHE_PATTERNS = ["stats:summary:*", "stats:permits:*", "stats:voivodeships:*", "stats:stations:history:*"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "..", "workers", "ukeImport.worker.js");

function associationKey(association: PermitStationAssociation): string {
  return `${association.permitId}:${association.stationId}`;
}

async function loadStationPermitAssociationKeys(): Promise<Set<string>> {
  const rows = await db.select({ permitId: stationsPermits.permit_id, stationId: stationsPermits.station_id }).from(stationsPermits);
  return new Set(
    rows
      .filter((association): association is PermitStationAssociation => association.permitId !== null && association.stationId !== null)
      .map(associationKey),
  );
}

function getNewAssociations(
  insertedAssociations: PermitStationAssociation[],
  previousAssociationKeys: ReadonlySet<string> | null,
): PermitStationAssociation[] {
  return insertedAssociations.filter((association) => previousAssociationKeys === null || !previousAssociationKeys.has(associationKey(association)));
}

type InternalStationChangeSummary = {
  stationStringId: string;
  permitsAdded: Set<number>;
  permitsDeleted: Set<number>;
  ukeStationsAdded: Set<number>;
  actionStation?: { id: number; location: { latitude: number; longitude: number } };
};

async function notifyInternalStationWatchersAboutUkeChanges(
  baseline: ImportBaseline,
  startedAt: string,
  newAssociations: PermitStationAssociation[],
): Promise<void> {
  const newAssociationPermitIds = new Set(newAssociations.map((association) => association.permitId));
  const newAssociationPermitIdList = [...newAssociationPermitIds];
  const insertedCondition = or(gt(ukePermits.id, baseline.permitId), gt(ukeStations.id, baseline.stationId));
  const whereCondition =
    newAssociationPermitIdList.length > 0 ? or(insertedCondition, inArray(ukePermits.id, newAssociationPermitIdList)) : insertedCondition;

  const [rows, deletedPermitRows] = await Promise.all([
    db
      .select({
        stationId: stations.id,
        stationStringId: stations.station_id,
        permitId: ukePermits.id,
        ukeStationId: ukeStations.id,
        ukeLatitude: ukeLocations.latitude,
        ukeLongitude: ukeLocations.longitude,
      })
      .from(stationsPermits)
      .innerJoin(stations, eq(stationsPermits.station_id, stations.id))
      .innerJoin(ukePermits, eq(stationsPermits.permit_id, ukePermits.id))
      .innerJoin(ukeStations, eq(ukePermits.uke_station_id, ukeStations.id))
      .innerJoin(ukeLocations, eq(ukeStations.location_id, ukeLocations.id))
      .where(whereCondition),
    db
      .select({
        permitId: deletedEntries.source_id,
        internalStationId: sql<number | null>`(${deletedEntries.data}->>'internal_station_id')::integer`,
      })
      .from(deletedEntries)
      .where(and(eq(deletedEntries.source_table, "uke_permits"), gte(deletedEntries.deleted_at, new Date(startedAt)))),
  ]);

  const byStation = new Map<number, InternalStationChangeSummary>();
  const getSummary = (stationId: number, stationStringId: string): InternalStationChangeSummary => {
    const existing = byStation.get(stationId);
    if (existing) return existing;

    const summary: InternalStationChangeSummary = {
      stationStringId,
      permitsAdded: new Set<number>(),
      permitsDeleted: new Set<number>(),
      ukeStationsAdded: new Set<number>(),
    };
    byStation.set(stationId, summary);
    return summary;
  };

  for (const row of rows) {
    const summary = getSummary(row.stationId, row.stationStringId);

    if (row.permitId > baseline.permitId || newAssociationPermitIds.has(row.permitId)) summary.permitsAdded.add(row.permitId);
    if (row.ukeStationId > baseline.stationId) summary.ukeStationsAdded.add(row.ukeStationId);
    if (!summary.actionStation)
      summary.actionStation = { id: row.ukeStationId, location: { latitude: row.ukeLatitude, longitude: row.ukeLongitude } };
  }

  const deletedInternalStationIds = new Set(
    deletedPermitRows.map((row) => row.internalStationId).filter((stationId): stationId is number => stationId !== null),
  );
  const deletedStationRows = deletedInternalStationIds.size
    ? await db
        .select({ id: stations.id, stationStringId: stations.station_id, latitude: locations.latitude, longitude: locations.longitude })
        .from(stations)
        .leftJoin(locations, eq(stations.location_id, locations.id))
        .where(inArray(stations.id, [...deletedInternalStationIds]))
    : [];
  const deletedStationById = new Map(deletedStationRows.map((row) => [row.id, row]));

  for (const row of deletedPermitRows) {
    if (row.internalStationId === null) continue;
    const station = deletedStationById.get(row.internalStationId);
    if (!station) continue;
    getSummary(row.internalStationId, station.stationStringId).permitsDeleted.add(row.permitId);
  }

  await Promise.allSettled(
    [...byStation].map(([stationId, summary]) => {
      const permitsAdded = summary.permitsAdded.size;
      const permitsDeleted = summary.permitsDeleted.size;
      const ukeStationsAdded = summary.ukeStationsAdded.size;
      const count = permitsAdded + permitsDeleted + ukeStationsAdded;
      if (count === 0) return Promise.resolve();

      const deletedStation = deletedStationById.get(stationId);
      const actionUrl = summary.actionStation
        ? buildUkeStationActionUrl(summary.actionStation)
        : deletedStation && deletedStation.latitude !== null && deletedStation.longitude !== null
          ? buildInternalStationActionUrl({
              id: stationId,
              location: { latitude: deletedStation.latitude, longitude: deletedStation.longitude },
            })
          : undefined;

      return notifyStationWatchers({
        stationId,
        stationStringId: summary.stationStringId,
        type: "station_uke_permit_added",
        metadata: {
          permits_added: permitsAdded,
          permits_deleted: permitsDeleted,
          uke_stations_added: ukeStationsAdded,
          count,
        },
        actionUrl,
      });
    }),
  );
}

async function notifyUkeStationWatchersAboutUkeChanges(baseline: ImportBaseline, startedAt: string): Promise<void> {
  const deletedUkeStationId = sql<number>`(${deletedEntries.data}->>'uke_station_id')::integer`;

  const [rows, deletedPermitRows] = await Promise.all([
    db
      .select({
        ukeStationId: ukeStations.id,
        stationStringId: ukeStations.station_id,
        permitId: ukePermits.id,
        ukeLatitude: ukeLocations.latitude,
        ukeLongitude: ukeLocations.longitude,
      })
      .from(ukePermits)
      .innerJoin(ukeStations, eq(ukePermits.uke_station_id, ukeStations.id))
      .innerJoin(ukeLocations, eq(ukeStations.location_id, ukeLocations.id))
      .where(or(gt(ukePermits.id, baseline.permitId), gt(ukeStations.id, baseline.stationId))),
    db
      .select({
        ukeStationId: ukeStations.id,
        stationStringId: ukeStations.station_id,
        permitId: deletedEntries.source_id,
        ukeLatitude: ukeLocations.latitude,
        ukeLongitude: ukeLocations.longitude,
        hasLivePermits: sql<boolean>`EXISTS (SELECT 1 FROM ${ukePermits} WHERE ${ukePermits.uke_station_id} = ${ukeStations.id})`,
      })
      .from(deletedEntries)
      .innerJoin(ukeStations, eq(ukeStations.id, deletedUkeStationId))
      .innerJoin(ukeLocations, eq(ukeStations.location_id, ukeLocations.id))
      .where(and(eq(deletedEntries.source_table, "uke_permits"), gte(deletedEntries.deleted_at, new Date(startedAt)))),
  ]);

  type UkeStationChangeSummary = {
    stationStringId: string;
    permitsAdded: Set<number>;
    permitsDeleted: Set<number>;
    ukeStationsAdded: Set<number>;
    stationDeleted: boolean;
    actionStation: { id: number; location: { latitude: number; longitude: number } };
  };

  const byStation = new Map<number, UkeStationChangeSummary>();
  const getSummary = (row: { ukeStationId: number; stationStringId: string; ukeLatitude: number; ukeLongitude: number }): UkeStationChangeSummary => {
    const existing = byStation.get(row.ukeStationId);
    if (existing) return existing;

    const summary: UkeStationChangeSummary = {
      stationStringId: row.stationStringId,
      permitsAdded: new Set<number>(),
      permitsDeleted: new Set<number>(),
      ukeStationsAdded: new Set<number>(),
      stationDeleted: false,
      actionStation: { id: row.ukeStationId, location: { latitude: row.ukeLatitude, longitude: row.ukeLongitude } },
    };
    byStation.set(row.ukeStationId, summary);
    return summary;
  };

  for (const row of rows) {
    const summary = getSummary(row);

    if (row.permitId > baseline.permitId) summary.permitsAdded.add(row.permitId);
    if (row.ukeStationId > baseline.stationId) summary.ukeStationsAdded.add(row.ukeStationId);
  }

  for (const row of deletedPermitRows) {
    const summary = getSummary(row);
    summary.permitsDeleted.add(row.permitId);
    if (!row.hasLivePermits) summary.stationDeleted = true;
  }

  await Promise.allSettled(
    [...byStation].map(([ukeStationId, summary]) => {
      const permitsAdded = summary.permitsAdded.size;
      const permitsDeleted = summary.permitsDeleted.size;
      const ukeStationsAdded = summary.ukeStationsAdded.size;
      const count = permitsAdded + permitsDeleted + ukeStationsAdded;
      if (count === 0) return Promise.resolve();
      return notifyUkeStationWatchers({
        ukeStationId,
        stationStringId: summary.stationStringId,
        type: "station_uke_permit_added",
        stationDeleted: summary.stationDeleted,
        metadata: {
          permits_added: permitsAdded,
          permits_deleted: permitsDeleted,
          uke_stations_added: ukeStationsAdded,
          ...(summary.stationDeleted ? { uke_station_deleted: true } : {}),
          count,
        },
        actionUrl: summary.stationDeleted
          ? buildMapLocationActionUrl(summary.actionStation.location)
          : buildUkeStationActionUrl(summary.actionStation),
      });
    }),
  );
}

function makeSteps(): ImportStep[] {
  return IMPORT_STEP_KEYS.map((key) => ({ key, status: "pending" }));
}

async function saveJob(job: ImportJob): Promise<void> {
  await redis.set(REDIS_KEY, JSON.stringify(job));
}

function shouldKeepInHistory(job: ImportJobStatus): boolean {
  return job.state === "error" || job.steps.some((step) => step.status === "error" || (step.status === "success" && SOURCE_STEP_KEYS.has(step.key)));
}

async function addJobToHistory(job: HistoryJob): Promise<void> {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  await redis
    .multi()
    .set(`${HISTORY_KEY}:${job.id}`, JSON.stringify(job), { expiration: { type: "EX", value: HISTORY_RETENTION_SECONDS } })
    .zAdd(HISTORY_KEY, { score: new Date(job.startedAt).getTime(), value: job.id })
    .zRemRangeByScore(HISTORY_KEY, "-inf", cutoff - 1)
    .expire(HISTORY_KEY, HISTORY_RETENTION_SECONDS)
    .exec();
}

async function releaseImportLock(token: string): Promise<void> {
  await redis.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0', {
    keys: [REDIS_LOCK_KEY],
    arguments: [token],
  });
}

async function renewImportLock(token: string): Promise<void> {
  const renewed = await redis.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("EXPIRE", KEYS[1], ARGV[2]) end return 0', {
    keys: [REDIS_LOCK_KEY],
    arguments: [token, String(LOCK_TTL_SECONDS)],
  });
  if (renewed !== 1) logger.error("UKE import lock lost while job is running");
}

function keepImportLockAlive(token: string): () => void {
  const deadline = Date.now() + MAX_IMPORT_DURATION_MS;
  const renewal = setInterval(() => {
    if (Date.now() < deadline) {
      void renewImportLock(token).catch((error) => logger.error("Failed to renew UKE import lock", { error }));
      return;
    }
    clearInterval(renewal);
    logger.error("UKE import exceeded its maximum duration, lock renewal stopped", { maxDurationMs: MAX_IMPORT_DURATION_MS });
  }, LOCK_RENEW_INTERVAL_MS);
  return () => clearInterval(renewal);
}

async function findStatisticsCacheKeyBatches(pattern: string): Promise<string[][]> {
  const keyBatches: string[][] = [];

  for await (const keys of redis.scanIterator({ MATCH: pattern })) {
    if (keys.length > 0) keyBatches.push(keys);
  }

  return keyBatches;
}

async function invalidateStatisticsCache(): Promise<void> {
  const keyBatches = (await Promise.all(STATISTICS_CACHE_PATTERNS.map(findStatisticsCacheKeyBatches))).flat();
  await Promise.all(keyBatches.map((keys) => redis.del(keys)));
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

function markError(job: ImportJobStatus, key: ImportStepKey, error?: string): void {
  updateStep(job, key, { status: "error", finishedAt: new Date().toISOString(), error });
}

function runInWorker(task: ImportWorkerTask): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { task },
      execArgv: process.execArgv,
    });
    const timeout = setTimeout(() => {
      reject(new Error(`Worker timed out after ${WORKER_TIMEOUT_MS / 60_000} minutes`));
      void worker.terminate();
    }, WORKER_TIMEOUT_MS);

    worker.on("message", (msg: { success: boolean; result?: boolean; error?: string }) => {
      clearTimeout(timeout);
      if (msg.success) {
        resolve(msg.result ?? false);
      } else {
        reject(new Error(msg.error ?? "Worker task failed"));
      }
    });

    worker.on("error", reject);
    worker.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

async function runJobSourceImportStep(job: ImportJob, step: SourceImportStepKey, task: ImportWorkerTask, enabled: boolean): Promise<boolean> {
  return runSourceImportStep(step, task, enabled, {
    runTask: runInWorker,
    persistStatus: async (sourceStep, status: SourceImportStepStatus, error?: string) => {
      if (status === "running") markRunning(job, sourceStep);
      else if (status === "success") markSuccess(job, sourceStep);
      else if (status === "skipped") markSkipped(job, sourceStep);
      else {
        markError(job, sourceStep, error);
        logger.error("UKE source import failed", { step: sourceStep, error });
      }
      await saveJob(job);
    },
  });
}

function withInterruptedState(job: ImportJobStatus, activeJobId: string | null): ImportJobStatus {
  if (job.state !== "running" || job.id === activeJobId) return job;
  return {
    ...job,
    state: "error",
    error: job.error ?? INTERRUPTED_JOB_ERROR,
    steps: job.steps.map((step): ImportStep => {
      if (step.status === "running") return { ...step, status: "error" };
      if (step.status === "pending") return { ...step, status: "skipped" };
      return step;
    }),
  };
}

export async function getImportJobStatus(): Promise<ImportJobStatus> {
  const [raw, activeJobId] = await Promise.all([redis.get(REDIS_KEY), redis.get(REDIS_LOCK_KEY)]);
  if (!raw) return { state: "idle", steps: [] };
  return withInterruptedState(JSON.parse(raw) as ImportJobStatus, activeJobId);
}

export async function getImportJobHistory(): Promise<ImportJobStatus[]> {
  const ids = (await redis.zRangeByScore(HISTORY_KEY, Date.now() - HISTORY_RETENTION_MS, "+inf")).reverse();
  if (ids.length === 0) return [];

  const snapshots = await redis.mGet(ids.map((id) => `${HISTORY_KEY}:${id}`));
  return snapshots.filter((snapshot): snapshot is string => snapshot !== null).map((snapshot) => JSON.parse(snapshot) as ImportJobStatus);
}

async function archiveInterruptedJob(): Promise<void> {
  const raw = await redis.get(REDIS_KEY);
  if (!raw) return;
  const previous = JSON.parse(raw) as ImportJobStatus;
  if (previous.state !== "running" || !previous.id || !previous.startedAt) return;
  await addJobToHistory({ ...withInterruptedState(previous, null), id: previous.id, startedAt: previous.startedAt });
}

export async function startImportJob(
  options: ImportOptions,
  trigger: ImportTrigger = "manual",
): Promise<{ started: boolean; status: ImportJobStatus }> {
  const id = randomUUID();
  const acquired = await redis.set(REDIS_LOCK_KEY, id, { expiration: { type: "EX", value: LOCK_TTL_SECONDS }, condition: "NX" });
  if (!acquired) return { started: false, status: await getImportJobStatus() };

  const job: ImportJob = {
    id,
    trigger,
    state: "running",
    startedAt: new Date().toISOString(),
    steps: makeSteps(),
  };
  try {
    await archiveInterruptedJob().catch((error) => logger.error("Failed to archive interrupted UKE import", { error: errorMessage(error) }));
    await saveJob(job);
  } catch (error) {
    await releaseImportLock(id);
    throw error;
  }

  setImmediate(() => void runJob(job, options).catch((error) => logger.error("UKE import job runner failed", { error: errorMessage(error) })));
  return { started: true, status: { ...job, steps: job.steps.map((s) => ({ ...s })) } };
}

async function runStep(job: ImportJob, key: ImportStepKey, action: () => Promise<unknown>, { optional = false } = {}): Promise<boolean> {
  markRunning(job, key);
  await saveJob(job);
  try {
    await action();
  } catch (error) {
    const message = errorMessage(error);
    markError(job, key, message);
    await saveJob(job);
    if (!optional) throw new ImportStepError(message);
    logger.error("UKE import step failed", { step: key, error: message });
    return false;
  }
  markSuccess(job, key);
  await saveJob(job);
  return true;
}

function describeErrors(steps: ImportStep[], jobError?: string): string | undefined {
  const errors = steps.flatMap((step) => (step.error ? [`${step.key}: ${step.error}`] : []));
  if (jobError) errors.push(jobError);
  return errors.length > 0 ? errors.join("; ") : undefined;
}

async function runJob(job: ImportJob, options: ImportOptions): Promise<void> {
  const stopLockRenewal = keepImportLockAlive(job.id);
  const {
    importPermits: shouldImportPermits = true,
    importRadiolines: shouldImportRadiolines = false,
    importDeviceRegistry: shouldImportDeviceRegistry = true,
  } = options;

  try {
    const baseline = await loadImportBaseline();
    const permitsChanged = await runJobSourceImportStep(job, "permits", "importPermits", shouldImportPermits);
    const radiolinesChanged = await runJobSourceImportStep(job, "radiolines", "importRadiolines", shouldImportRadiolines);
    const deviceRegistryChanged = await runJobSourceImportStep(job, "device_registry", "importDeviceRegistry", shouldImportDeviceRegistry);
    const failedSourceSteps = job.steps.filter((step) => step.status === "error");
    const permitDataChanged = permitsChanged || deviceRegistryChanged;
    const permitSourceFailed = failedSourceSteps.some((step) => step.key === "permits" || step.key === "device_registry");
    const anySourceChanged = permitDataChanged || radiolinesChanged;

    await runStep(job, "prune_deleted_entries", async () => {
      const cutoff = new Date(Date.now() - DELETED_ENTRIES_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const pruned = await db.delete(deletedEntries).where(lt(deletedEntries.deleted_at, cutoff)).returning({ id: deletedEntries.id });
      logger.info(`Pruned ${pruned.length} deleted entries older than ${DELETED_ENTRIES_RETENTION_DAYS} days`);
    });

    if (permitDataChanged) {
      let associationKeysBeforePrune: Set<string> | null = null;
      await runStep(job, "cleanup_orphaned_uke_entities", async () => {
        await notifyUkeStationWatchersAboutUkeChanges(baseline, job.startedAt).catch((e) =>
          logger.error("Failed to send UKE station watch notifications", { error: errorMessage(e) }),
        );
        await cleanupOrphanedUkeStations();
        await cleanupOrphanedUkeLocations();
      });
      await runStep(job, "prune_associations", async () => {
        associationKeysBeforePrune = await loadStationPermitAssociationKeys();
        await pruneStationsPermits();
      });
      await runStep(job, "associate", async () => {
        const insertedAssociations = await associateStationsWithPermits();
        const newAssociations = getNewAssociations(insertedAssociations, associationKeysBeforePrune);
        void notifyInternalStationWatchersAboutUkeChanges(baseline, job.startedAt, newAssociations).catch((e) =>
          logger.error("Failed to send internal station UKE change notifications", { error: errorMessage(e) }),
        );
      });
    } else {
      markSkipped(job, "cleanup_orphaned_uke_entities");
      markSkipped(job, "prune_associations");
      markSkipped(job, "associate");
      await saveJob(job);
    }

    let snapshotCompleted = false;
    if (permitDataChanged && !permitSourceFailed) {
      snapshotCompleted = await runStep(job, "snapshot", takeStatsSnapshot, { optional: true });
    } else {
      markSkipped(job, "snapshot");
      await saveJob(job);
    }

    if (permitDataChanged || permitSourceFailed) {
      await runStep(job, "refresh_statistics", invalidateStatisticsCache, { optional: true });
    } else {
      markSkipped(job, "refresh_statistics");
      await saveJob(job);
    }

    job.state = failedSourceSteps.length > 0 ? "error" : "success";
    job.finishedAt = new Date().toISOString();
    await saveJob(job);

    const sourceErrors = describeErrors(failedSourceSteps);
    if (sourceErrors) logger.error("UKE import job completed with source errors", { error: sourceErrors });
    if (anySourceChanged) notifyUkeUpdate().catch((e) => logger.error("Failed to send UKE update notifications", { error: errorMessage(e) }));

    if (anySourceChanged || sourceErrors) {
      const deltaPromise = anySourceChanged ? computeImportDelta(baseline, job.startedAt) : Promise.resolve(undefined);
      const snapshotDeltaPromise = snapshotCompleted ? getSnapshotDelta().catch(() => null) : Promise.resolve(undefined);
      Promise.all([deltaPromise, snapshotDeltaPromise])
        .then(([delta, snapshotDelta]) =>
          redis.publish(
            IMPORT_COMPLETE_CHANNEL,
            JSON.stringify({ state: job.state, startedAt: job.startedAt, finishedAt: job.finishedAt, error: sourceErrors, delta, snapshotDelta }),
          ),
        )
        .catch((e) => logger.error("Failed to publish import complete event", { error: errorMessage(e) }));
    }
  } catch (e) {
    job.state = "error";
    job.finishedAt = new Date().toISOString();
    if (!(e instanceof ImportStepError)) job.error = errorMessage(e);
    await saveJob(job);
    logger.error("UKE import job failed", { error: describeErrors(job.steps, job.error) });
  } finally {
    try {
      await runStep(job, "cleanup", cleanupDownloads, { optional: true });
      if (shouldKeepInHistory(job)) await addJobToHistory(job);
    } finally {
      stopLockRenewal();
      await releaseImportLock(job.id);
    }
  }
}
