import figlet from "figlet";
import cluster from "node:cluster";
import { randomUUID } from "node:crypto";
import { availableParallelism, constants } from "node:os";

import App from "./app.js";
import { port, ukeAutoImportEnabled } from "./config.js";
import redis from "./database/redis.js";
import { systemAuditContext } from "./features/audit/index.js";
import { deliverQueuedStationWatchNotifications, deliverQueuedSubmissionApprovalNotifications } from "./features/notifications/service.js";
import { cleanupExpiredInactiveStations } from "./features/stations/inactiveCleanup.js";
import { takeContributionSnapshot } from "./features/stats/contributionSnapshot.ts";
import { cleanupOrphanedSubmissions, removeRejectedSubmissionPhotos } from "./features/submissions/cleanup.js";
import { getImportJobStatus, startImportJob } from "./features/ukeImport/job.js";
import { withRedisDeadline } from "./lib/redisDeadline.js";
import { acquireRedisLock, refreshOwnedRedisLock, releaseOwnedRedisLock } from "./lib/redisLock.js";
import { refreshDisposableEmailBlocklist } from "./plugins/auth/disposableEmailBlocklist.js";
import { installProcessErrorHandlers, logger } from "./utils/logger.js";

type SchedulerTerm = { isActive: boolean; timers: Set<NodeJS.Timeout> };
type WorkerSlot = { port: string; startedAt: number };

const workerCount = Number(process.env.WORKERS) || availableParallelism();
const QUICK_EXIT_MS = 10_000;
const MAX_RESTART_DELAY_MS = 10_000;
const SIGNAL_EXIT_CODE_BASE = 128;
const WORKER_DRAIN_DEADLINE_MS = 25_000;
const STOP_WORKER_MESSAGE = "stop";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;
const REJECTED_PHOTO_RETENTION_MS = 30 * DAY_MS;
const SCHEDULER_LOCK_KEY = "scheduler:leader";
const SCHEDULER_LOCK_TTL = 30;
const SKIPPED_RUN_RETRY_MS = MINUTE_MS;
const UKE_IMPORT_INTERVAL_HOURS = 6;
const UKE_IMPORT_CHECK_INTERVAL_MS = MINUTE_MS;
const UKE_IMPORT_MAX_STARTS_PER_SLOT = 3;
const COUNT_START_SCRIPT = 'local starts = redis.call("INCR", KEYS[1]) redis.call("EXPIRE", KEYS[1], ARGV[1]) return starts';
const NOTIFICATION_DIGEST_INTERVAL_MS = Math.max(10_000, Number(process.env.NOTIFICATION_DIGEST_INTERVAL_MS) || 60_000);

const schedulerIdentity = `${process.env.HOSTNAME ?? "local"}:${process.pid}:${randomUUID()}`;
let currentTerm: SchedulerTerm | null = null;
let isStopping = false;

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.message || error.name;
}

function renewSchedulerLock(): Promise<boolean> {
  return refreshOwnedRedisLock(SCHEDULER_LOCK_KEY, schedulerIdentity, SCHEDULER_LOCK_TTL).catch(() => false);
}

function runLater(term: SchedulerTerm, delayMs: number, task: () => Promise<void>): void {
  if (!term.isActive) return;

  const timer = setTimeout(() => {
    term.timers.delete(timer);
    void task();
  }, delayMs);
  term.timers.add(timer);
}

function runEvery(term: SchedulerTerm, firstDelayMs: number, intervalMs: number, task: () => Promise<unknown>): void {
  runLater(term, firstDelayMs, async function run() {
    const isLeader = (await renewSchedulerLock()) && term.isActive;
    if (isLeader) await task().catch((e) => logger.error("Scheduled task failed", { error: describeError(e) }));
    runLater(term, isLeader ? intervalMs : Math.min(intervalMs, SKIPPED_RUN_RETRY_MS), run);
  });
}

function endSchedulerTerm(term: SchedulerTerm): void {
  term.isActive = false;
  for (const timer of term.timers) clearTimeout(timer);
  term.timers.clear();
}

function getUkeImportSlot(date = new Date()): Date {
  const slot = new Date(date);
  const slotHour = Math.floor(slot.getUTCHours() / UKE_IMPORT_INTERVAL_HOURS) * UKE_IMPORT_INTERVAL_HOURS;
  slot.setUTCHours(slotHour, 0, 0, 0);
  return slot;
}

async function ensureScheduledUkeImport(): Promise<void> {
  const slot = getUkeImportSlot();
  const status = await getImportJobStatus();
  if (status.state === "running") return;

  const hasFinishedInSlot = status.finishedAt !== undefined && new Date(status.finishedAt) >= slot;
  if (hasFinishedInSlot) return;

  const startsKey = `uke:import:scheduled-starts:${slot.toISOString()}`;
  if (Number(await redis.get(startsKey)) >= UKE_IMPORT_MAX_STARTS_PER_SLOT) return;

  const start = Number(await redis.eval(COUNT_START_SCRIPT, { keys: [startsKey], arguments: [String(UKE_IMPORT_INTERVAL_HOURS * 3600)] }));

  const { started } = await startImportJob({ importPermits: true, importRadiolines: true, importDeviceRegistry: true }, "scheduled");
  if (!started) {
    await redis.decr(startsKey);
    return;
  }

  logger.info("uke_import_scheduled", { trigger: "six_hourly", slot: slot.toISOString(), start });
  if (start >= UKE_IMPORT_MAX_STARTS_PER_SLOT) logger.warn("uke_import_last_start_in_slot", { slot: slot.toISOString() });
}

async function deliverNotificationDigests(): Promise<void> {
  const delivered = await deliverQueuedStationWatchNotifications().catch((e) => {
    logger.error("Failed to deliver station watch notification batch", { error: describeError(e) });
    return 0;
  });
  if (delivered > 0) logger.info("station_watch_notifications_delivered", { count: delivered });

  const approvalBatches = await deliverQueuedSubmissionApprovalNotifications().catch((e) => {
    logger.error("Failed to deliver grouped submission approval notifications", { error: describeError(e) });
    return 0;
  });
  if (approvalBatches > 0) logger.info("submission_approval_notification_batches_delivered", { count: approvalBatches });
}

async function removeExpiredRejectedPhotos(): Promise<void> {
  const rejectedBefore = new Date(Date.now() - REJECTED_PHOTO_RETENTION_MS);
  await removeRejectedSubmissionPhotos(systemAuditContext(), { rejectedBefore });
}

function startScheduledTasks(term: SchedulerTerm): void {
  if (ukeAutoImportEnabled) {
    runEvery(term, 0, UKE_IMPORT_CHECK_INTERVAL_MS, () =>
      ensureScheduledUkeImport().catch((e) => logger.error("Failed to trigger scheduled UKE import", { error: describeError(e) })),
    );
  } else {
    logger.info("uke_import_schedule_disabled", { reason: "UKE_AUTO_IMPORT=false" });
  }

  runEvery(term, 5 * MINUTE_MS, 5 * MINUTE_MS, () =>
    cleanupOrphanedSubmissions().catch((e) => logger.error("Failed to cleanup orphaned submissions", { error: e })),
  );
  runEvery(term, MINUTE_MS, DAY_MS, () =>
    cleanupExpiredInactiveStations().catch((e) => logger.error("Failed to cleanup inactive stations", { error: e })),
  );
  runEvery(term, 10 * MINUTE_MS, HOUR_MS, () =>
    removeExpiredRejectedPhotos().catch((e) => logger.error("Failed to remove photos of rejected submissions", { error: e })),
  );
  runEvery(term, NOTIFICATION_DIGEST_INTERVAL_MS, NOTIFICATION_DIGEST_INTERVAL_MS, deliverNotificationDigests);
  runEvery(term, 90_000, DAY_MS, () =>
    takeContributionSnapshot().catch((e) => logger.error("Failed to take contribution snapshot", { error: describeError(e) })),
  );
}

function retryElectionLater(): void {
  setTimeout(() => void tryBecomeScheduler(), SCHEDULER_LOCK_TTL * 1000);
}

function runAsScheduler(): void {
  const term: SchedulerTerm = { isActive: true, timers: new Set() };
  currentTerm = term;
  const renewInterval = setInterval(
    async () => {
      const isStillLeader = await renewSchedulerLock();
      if (isStillLeader || !term.isActive) return;

      clearInterval(renewInterval);
      endSchedulerTerm(term);
      logger.info("scheduler_lock_lost", { msg: "Lost scheduler leadership, will retry" });
      retryElectionLater();
    },
    (SCHEDULER_LOCK_TTL / 2) * 1000,
  );

  startScheduledTasks(term);
}

async function tryBecomeScheduler(): Promise<void> {
  if (isStopping) return;

  const hasTakenLock = await acquireRedisLock(SCHEDULER_LOCK_KEY, schedulerIdentity, SCHEDULER_LOCK_TTL).catch(() => false);
  const isLeader = hasTakenLock || (await renewSchedulerLock());
  if (!isLeader) {
    retryElectionLater();
    return;
  }

  logger.info("scheduler_leader_elected", { identity: schedulerIdentity });
  runAsScheduler();
}

async function resignAsScheduler(): Promise<void> {
  if (currentTerm !== null) endSchedulerTerm(currentTerm);

  const hasReleasedLock = await withRedisDeadline(releaseOwnedRedisLock(SCHEDULER_LOCK_KEY, schedulerIdentity)).catch(() => false);
  if (hasReleasedLock) logger.info("scheduler_lock_released", { identity: schedulerIdentity });
}

if (cluster.isPrimary) {
  console.log(await figlet("sora"));
  installProcessErrorHandlers();
  logger.info("primary_started", { pid: process.pid, workers: workerCount });
  await refreshDisposableEmailBlocklist();

  const workerSlots = new Map<number, WorkerSlot>();
  const quickExitsByPort = new Map<string, number>();

  const startWorker = (workerPort: string) => {
    if (isStopping) return;

    const w = cluster.fork({ WORKER_PORT: workerPort });
    workerSlots.set(w.id, { port: workerPort, startedAt: Date.now() });
  };

  const restartDelayMs = (slot: WorkerSlot | undefined): number => {
    if (!slot) return 0;
    if (Date.now() - slot.startedAt >= QUICK_EXIT_MS) {
      quickExitsByPort.delete(slot.port);
      return 0;
    }

    const quickExits = (quickExitsByPort.get(slot.port) ?? 0) + 1;
    quickExitsByPort.set(slot.port, quickExits);
    return Math.min(MAX_RESTART_DELAY_MS, 500 * 2 ** quickExits);
  };

  for (let i = 0; i < workerCount; i++) startWorker(String(port + 1 + i));

  const drainWorkers = async (): Promise<void> => {
    const workers = Object.values(cluster.workers ?? {})
      .filter((worker) => worker !== undefined)
      .filter((worker) => worker.isConnected());
    const exits = workers.map((worker) => new Promise<void>((resolve) => worker.once("exit", () => resolve())));
    for (const worker of workers) worker.send(STOP_WORKER_MESSAGE);

    const deadline = new Promise<void>((resolve) => {
      setTimeout(resolve, WORKER_DRAIN_DEADLINE_MS);
    });
    await Promise.race([Promise.all(exits), deadline]);
  };

  const stop = async (signal: NodeJS.Signals) => {
    if (isStopping) return;

    isStopping = true;
    try {
      await Promise.all([resignAsScheduler(), drainWorkers()]);
    } finally {
      process.exit(SIGNAL_EXIT_CODE_BASE + constants.signals[signal]);
    }
  };

  cluster.on("exit", (worker, code) => {
    if (isStopping) return;

    const slot = workerSlots.get(worker.id);
    workerSlots.delete(worker.id);
    const restartInMs = restartDelayMs(slot);
    logger.warn("worker_exit", { pid: worker.process.pid, code, restartInMs });
    setTimeout(() => startWorker(slot?.port ?? String(port + 1)), restartInMs);
  });

  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));

  void tryBecomeScheduler();
} else {
  installProcessErrorHandlers();
  const workerPort = Number(process.env.WORKER_PORT) || port;
  const app = new App();
  void app.listen(workerPort).then(() => {
    logger.info("worker_started", { pid: process.pid, port: workerPort });
  });

  process.on("message", (message) => {
    if (message !== STOP_WORKER_MESSAGE || isStopping) return;

    isStopping = true;
    void app.fastify.close().finally(() => process.exit(0));
  });
}
