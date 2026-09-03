import figlet from "figlet";
import cluster from "node:cluster";
import { availableParallelism } from "node:os";

import App from "./app.js";
import { port } from "./config.js";
import redis from "./database/redis.js";
import { takeContributionSnapshot } from "./services/contributionSnapshot.service.ts";
import { refreshDisposableEmailBlocklist } from "./services/disposableEmailBlocklist.service.js";
import { cleanupExpiredInactiveStations } from "./services/inactiveStationCleanup.service.js";
import { deliverQueuedStationWatchNotifications, deliverQueuedSubmissionApprovalNotifications } from "./services/notifications/service.js";
import { cleanupOrphanedSubmissions } from "./services/submissions/cleanup.js";
import { startImportJob } from "./services/ukeImportJob.service.js";
import { installProcessErrorHandlers, logger } from "./utils/logger.js";

const workerCount = Number(process.env.WORKERS) || availableParallelism();

const SCHEDULER_LOCK_KEY = "scheduler:leader";
const SCHEDULER_LOCK_TTL = 30;
const UKE_IMPORT_INTERVAL_HOURS = 6;
const UKE_IMPORT_INTERVAL_MS = UKE_IMPORT_INTERVAL_HOURS * 60 * 60 * 1000;
const UKE_IMPORT_SLOT_TTL_SECONDS = UKE_IMPORT_INTERVAL_HOURS * 2 * 60 * 60;
const UKE_IMPORT_SLOT_KEY_PREFIX = "uke:import:schedule:";
const NOTIFICATION_DIGEST_INTERVAL_MS = Math.max(10_000, Number(process.env.NOTIFICATION_DIGEST_INTERVAL_MS) || 60_000);

function getSchedulerIdentity(): string {
  return process.env.HOSTNAME ?? process.pid.toString();
}

async function tryAcquireSchedulerLock(): Promise<boolean> {
  const acquired = await redis.set(SCHEDULER_LOCK_KEY, getSchedulerIdentity(), {
    expiration: { type: "EX", value: SCHEDULER_LOCK_TTL },
    condition: "NX",
  });
  return !!acquired;
}

async function renewSchedulerLock(): Promise<boolean> {
  const holder = await redis.get(SCHEDULER_LOCK_KEY);
  if (holder !== getSchedulerIdentity()) return false;
  await redis.expire(SCHEDULER_LOCK_KEY, SCHEDULER_LOCK_TTL);
  return true;
}

async function runAsScheduler() {
  const renewInterval = setInterval(
    async () => {
      const renewed = await renewSchedulerLock().catch(() => false);
      if (!renewed) {
        clearInterval(renewInterval);
        logger.info("scheduler_lock_lost", { msg: "Lost scheduler leadership, will retry" });
        setTimeout(() => void tryBecomeScheduler(), SCHEDULER_LOCK_TTL * 1000);
      }
    },
    (SCHEDULER_LOCK_TTL / 2) * 1000,
  );

  scheduleUkeImport();
  scheduleSubmissionCleanup();
  scheduleInactiveStationCleanup();
  scheduleNotificationDigests();
  scheduleContributionSnapshot();
}

async function tryBecomeScheduler() {
  const isLeader = await tryAcquireSchedulerLock().catch(() => false);
  if (isLeader) {
    logger.info("scheduler_leader_elected", { identity: getSchedulerIdentity() });
    await runAsScheduler();
  } else {
    setTimeout(() => void tryBecomeScheduler(), SCHEDULER_LOCK_TTL * 1000);
  }
}

function getUkeImportSlot(date = new Date()): Date {
  const slot = new Date(date);
  const slotHour = Math.floor(slot.getUTCHours() / UKE_IMPORT_INTERVAL_HOURS) * UKE_IMPORT_INTERVAL_HOURS;
  slot.setUTCHours(slotHour, 0, 0, 0);
  return slot;
}

function getNextUkeImportSlot(date = new Date()): Date {
  return new Date(getUkeImportSlot(date).getTime() + UKE_IMPORT_INTERVAL_MS);
}

async function runScheduledUkeImport(slot: Date): Promise<void> {
  const isLeader = await renewSchedulerLock().catch(() => false);
  if (!isLeader) {
    logger.info("uke_import_schedule_skipped", { trigger: "six_hourly", slot: slot.toISOString(), reason: "not_scheduler_leader" });
    return;
  }

  const slotKey = `${UKE_IMPORT_SLOT_KEY_PREFIX}${slot.toISOString()}`;
  const acquired = await redis.set(slotKey, "1", {
    expiration: { type: "EX", value: UKE_IMPORT_SLOT_TTL_SECONDS },
    condition: "NX",
  });

  if (!acquired) {
    logger.info("uke_import_schedule_skipped", { trigger: "six_hourly", slot: slot.toISOString(), reason: "slot_already_claimed" });
    return;
  }

  logger.info("uke_import_scheduled", { trigger: "six_hourly", slot: slot.toISOString() });
  await startImportJob({ importPermits: true, importRadiolines: false, importDeviceRegistry: true });
}

function triggerScheduledUkeImport(slot: Date): void {
  void runScheduledUkeImport(slot).catch((e) =>
    logger.error("Failed to trigger scheduled UKE import", { error: e instanceof Error ? e.message : String(e) }),
  );
}

function scheduleNextUkeImport() {
  const now = new Date();
  const nextSlot = getNextUkeImportSlot(now);
  const delay = nextSlot.getTime() - now.getTime();

  setTimeout(() => {
    triggerScheduledUkeImport(nextSlot);
    scheduleNextUkeImport();
  }, delay);
}

function scheduleUkeImport() {
  triggerScheduledUkeImport(getUkeImportSlot());
  scheduleNextUkeImport();
}

function scheduleSubmissionCleanup() {
  setTimeout(
    async function run() {
      await cleanupOrphanedSubmissions().catch((e) => logger.error("Failed to cleanup orphaned submissions", { error: e }));
      setTimeout(run, 5 * 60 * 1000);
    },
    5 * 60 * 1000,
  );
}

function scheduleInactiveStationCleanup() {
  setTimeout(async function run() {
    await cleanupExpiredInactiveStations().catch((e) => logger.error("Failed to cleanup inactive stations", { error: e }));
    setTimeout(run, 24 * 60 * 60 * 1000);
  }, 60 * 1000);
}

function scheduleNotificationDigests() {
  setTimeout(async function run() {
    const isLeader = await renewSchedulerLock().catch(() => false);
    if (isLeader) {
      const delivered = await deliverQueuedStationWatchNotifications().catch((e) => {
        logger.error("Failed to deliver station watch notification batch", { error: e instanceof Error ? e.message : String(e) });
        return 0;
      });
      if (delivered > 0) logger.info("station_watch_notifications_delivered", { count: delivered });

      const approvalBatches = await deliverQueuedSubmissionApprovalNotifications().catch((e) => {
        logger.error("Failed to deliver grouped submission approval notifications", {
          error: e instanceof Error ? e.message : String(e),
        });
        return 0;
      });
      if (approvalBatches > 0) logger.info("submission_approval_notification_batches_delivered", { count: approvalBatches });
    }
    setTimeout(run, NOTIFICATION_DIGEST_INTERVAL_MS);
  }, NOTIFICATION_DIGEST_INTERVAL_MS);
}

function scheduleContributionSnapshot() {
  setTimeout(async function run() {
    const isLeader = await renewSchedulerLock().catch(() => false);
    if (isLeader) {
      await takeContributionSnapshot().catch((e) =>
        logger.error("Failed to take contribution snapshot", { error: e instanceof Error ? e.message : String(e) }),
      );
    }
    setTimeout(run, 24 * 60 * 60 * 1000); // 24h
  }, 90 * 1000); // 90 seconds
}
if (cluster.isPrimary) {
  console.log(await figlet("sora"));
  installProcessErrorHandlers();
  logger.info("primary_started", { pid: process.pid, workers: workerCount });
  await refreshDisposableEmailBlocklist();

  const workerPorts = new Map<number, string>();
  for (let i = 0; i < workerCount; i++) {
    const workerPort = String(port + 1 + i);
    const w = cluster.fork({ WORKER_PORT: workerPort });
    workerPorts.set(w.id, workerPort);
  }

  cluster.on("exit", (worker, code) => {
    logger.warn("worker_exit", { pid: worker.process.pid, code });
    const workerPort = workerPorts.get(worker.id) ?? String(port + 1);
    workerPorts.delete(worker.id);
    const w = cluster.fork({ WORKER_PORT: workerPort });
    workerPorts.set(w.id, workerPort);
  });

  void tryBecomeScheduler();
} else {
  installProcessErrorHandlers();
  const workerPort = Number(process.env.WORKER_PORT) || port;
  const app = new App();
  void app.listen(workerPort).then(() => {
    logger.info("worker_started", { pid: process.pid, port: workerPort });
  });
}
