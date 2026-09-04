import { deletedEntries, locations, stations, stationsPermits, ukeLocations, ukePermits, ukeRadiolines, ukeStations } from "@openbts/drizzle";
import { associateStationsWithPermits } from "@openbts/uke-importer/stations";
import { cleanupDownloads } from "@openbts/uke-importer/utils";
import { and, count, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { db } from "../database/psql.js";
import redis from "../database/redis.js";
import { logger } from "../utils/logger.js";
import { buildInternalStationActionUrl, buildMapLocationActionUrl, buildUkeStationActionUrl } from "./notifications/actionUrls.js";
import { notifyStationWatchers, notifyUkeStationWatchers, notifyUkeUpdate } from "./notifications/service.js";
import { cleanupOrphanedUkeLocations, cleanupOrphanedUkeStations, pruneStationsPermits } from "./stationsPermitsAssociation.service.js";
import { getSnapshotDelta, takeStatsSnapshot } from "./statsSnapshot.service.js";

type ImportStepKey =
  | "permits"
  | "radiolines"
  | "device_registry"
  | "prune_deleted_entries"
  | "prune_associations"
  | "cleanup_orphaned_uke_entities"
  | "associate"
  | "snapshot"
  | "refresh_statistics"
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

interface PermitStationAssociation {
  permitId: number;
  stationId: number;
}

const IMPORT_COMPLETE_CHANNEL = "uke:import:complete";

function getImportChangeSince(startedAt: string): Date {
  const since = new Date(startedAt);
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

async function computeImportDelta(startedAt: string): Promise<ImportDelta> {
  const since = getImportChangeSince(startedAt);

  const deletedSince = new Date(startedAt);

  const [stationsAdded, permitsAdded, permitsUpdated, permitsDeleted, radiolinesAdded, radiolinesDeleted] = await Promise.all([
    db.select({ count: count() }).from(ukeStations).where(gte(ukeStations.createdAt, since)),
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
  "cleanup_orphaned_uke_entities",
  "associate",
  "snapshot",
  "refresh_statistics",
  "cleanup",
];

const DELETED_ENTRIES_RETENTION_DAYS = Number(process.env.DELETED_ENTRIES_RETENTION_DAYS) || 180;
const REDIS_KEY = "uke:import:status";
const REDIS_LOCK_KEY = "uke:import:lock";
const LOCK_TTL_SECONDS = 3600;
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

async function notifyInternalStationWatchersAboutUkeChanges(startedAt: string, newAssociations: PermitStationAssociation[]): Promise<void> {
  const since = getImportChangeSince(startedAt);
  const sinceTime = since.getTime();
  const newAssociationPermitIds = new Set(newAssociations.map((association) => association.permitId));
  const newAssociationPermitIdList = [...newAssociationPermitIds];
  const dateCondition = or(gte(ukePermits.createdAt, since), gte(ukeStations.createdAt, since));
  const whereCondition =
    newAssociationPermitIdList.length > 0 ? or(dateCondition, inArray(ukePermits.id, newAssociationPermitIdList)) : dateCondition;

  const [rows, deletedPermitRows] = await Promise.all([
    db
      .select({
        stationId: stations.id,
        stationStringId: stations.station_id,
        permitId: ukePermits.id,
        permitCreatedAt: ukePermits.createdAt,
        ukeStationId: ukeStations.id,
        ukeStationCreatedAt: ukeStations.createdAt,
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

    const permitCreatedInImport = row.permitCreatedAt.getTime() >= sinceTime;
    const ukeStationCreatedInImport = row.ukeStationCreatedAt.getTime() >= sinceTime;

    if (permitCreatedInImport || newAssociationPermitIds.has(row.permitId)) summary.permitsAdded.add(row.permitId);
    if (ukeStationCreatedInImport) summary.ukeStationsAdded.add(row.ukeStationId);
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

async function notifyUkeStationWatchersAboutUkeChanges(startedAt: string): Promise<void> {
  const since = getImportChangeSince(startedAt);
  const sinceTime = since.getTime();
  const dateCondition = or(gte(ukePermits.createdAt, since), gte(ukeStations.createdAt, since));
  const deletedUkeStationId = sql<number>`(${deletedEntries.data}->>'uke_station_id')::integer`;

  const [rows, deletedPermitRows] = await Promise.all([
    db
      .select({
        ukeStationId: ukeStations.id,
        stationStringId: ukeStations.station_id,
        permitId: ukePermits.id,
        permitCreatedAt: ukePermits.createdAt,
        ukeStationCreatedAt: ukeStations.createdAt,
        ukeLatitude: ukeLocations.latitude,
        ukeLongitude: ukeLocations.longitude,
      })
      .from(ukePermits)
      .innerJoin(ukeStations, eq(ukePermits.uke_station_id, ukeStations.id))
      .innerJoin(ukeLocations, eq(ukeStations.location_id, ukeLocations.id))
      .where(dateCondition),
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

    const permitCreatedInImport = row.permitCreatedAt.getTime() >= sinceTime;
    const ukeStationCreatedInImport = row.ukeStationCreatedAt.getTime() >= sinceTime;

    if (permitCreatedInImport) summary.permitsAdded.add(row.permitId);
    if (ukeStationCreatedInImport) summary.ukeStationsAdded.add(row.ukeStationId);
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
  let associationKeysBeforePrune: Set<string> | null = null;

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
      markRunning(job, "cleanup_orphaned_uke_entities");
      await saveJob(job);
      try {
        if (job.startedAt) {
          await notifyUkeStationWatchersAboutUkeChanges(job.startedAt).catch((e) =>
            logger.error("Failed to send UKE station watch notifications", { error: e instanceof Error ? e.message : String(e) }),
          );
        }
        await cleanupOrphanedUkeStations();
        await cleanupOrphanedUkeLocations();
        markSuccess(job, "cleanup_orphaned_uke_entities");
        await saveJob(job);
      } catch (e) {
        markError(job, "cleanup_orphaned_uke_entities");
        await saveJob(job);
        throw e;
      }

      markRunning(job, "prune_associations");
      await saveJob(job);
      try {
        associationKeysBeforePrune = await loadStationPermitAssociationKeys();
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
        const insertedAssociations = await associateStationsWithPermits();
        const newAssociations = getNewAssociations(insertedAssociations, associationKeysBeforePrune);
        if (job.startedAt) {
          void notifyInternalStationWatchersAboutUkeChanges(job.startedAt, newAssociations).catch((e) =>
            logger.error("Failed to send internal station UKE change notifications", { error: e instanceof Error ? e.message : String(e) }),
          );
        }
        markSuccess(job, "associate");
        await saveJob(job);
      } catch (e) {
        markError(job, "associate");
        await saveJob(job);
        throw e;
      }
    } else {
      markSkipped(job, "cleanup_orphaned_uke_entities");
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

    if (permitsChanged || deviceRegistryChanged) {
      markRunning(job, "refresh_statistics");
      await saveJob(job);
      try {
        await invalidateStatisticsCache();
        markSuccess(job, "refresh_statistics");
        await saveJob(job);
      } catch (e) {
        markError(job, "refresh_statistics");
        await saveJob(job);
        logger.error("Failed to refresh statistics cache", { error: e instanceof Error ? e.message : String(e) });
      }
    } else {
      markSkipped(job, "refresh_statistics");
      await saveJob(job);
    }

    job.state = "success";
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
    if (permitsChanged || radiolinesChanged || deviceRegistryChanged) {
      notifyUkeUpdate().catch((e) => logger.error("Failed to send UKE update notifications", { error: e instanceof Error ? e.message : String(e) }));
      const importStartedAt = job.startedAt;
      if (importStartedAt !== undefined) {
        Promise.all([computeImportDelta(importStartedAt), getSnapshotDelta().catch(() => null)])
          .then(([delta, snapshotDelta]) =>
            redis.publish(
              IMPORT_COMPLETE_CHANNEL,
              JSON.stringify({ state: "success", startedAt: importStartedAt, finishedAt: job.finishedAt, delta, snapshotDelta }),
            ),
          )
          .catch((e) => logger.error("Failed to publish import complete event", { error: e instanceof Error ? e.message : String(e) }));
      }
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
