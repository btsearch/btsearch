import { dirtySites, engineHeartbeats, engineRuns, uploadFolds, uploads } from "@openbts/drizzle";
import { NIGHTLY_ENGINE_RUN_KINDS } from "@openbts/shared/contract";
import type { EngineState } from "@openbts/shared/contract";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, min, notInArray, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { newUploadsStore } from "../../measurements/rawFiles/store.js";
import { readStoredBytes } from "../../measurements/rawFiles/storedBytes.js";
import { loadCrowdSettings } from "../../measurements/settings.js";
import { selectRuns, toEngineRun } from "./runs.js";

const HEARTBEATS_SHOWN = 10;
const ERRORS_SHOWN = 10;
const NIGHTLY_RUNS_SHOWN = 14;
const RECENT_RUNS_SHOWN = 20;
const GIGABYTE = 1024 ** 3;

function countWaitingUploads() {
  return db
    .select({ waiting: count(), oldestWaitingAt: min(uploads.receivedAt) })
    .from(uploads)
    .where(inArray(uploads.status, ["received", "processing"]));
}

function countDueSubtractions() {
  return db
    .select({ due: count() })
    .from(uploads)
    .innerJoin(uploadFolds, eq(uploadFolds.uploadId, uploads.id))
    .where(and(inArray(uploads.status, ["withdrawn", "excluded"]), isNull(uploads.objectDeletedAt), isNull(uploadFolds.unfoldedAt)));
}

function countEndedLastDay() {
  return db
    .select({ status: uploads.status, ended: count() })
    .from(uploads)
    .where(and(inArray(uploads.status, ["processed", "rejected"]), gte(uploads.statusChangedAt, sql`now() - interval '24 hours'`)))
    .groupBy(uploads.status);
}

function latestUploadErrors() {
  return db
    .select({ uploadId: uploads.id, status: uploads.status, attempts: uploads.attempts, error: uploads.lastError, receivedAt: uploads.receivedAt })
    .from(uploads)
    .where(isNotNull(uploads.lastError))
    .orderBy(desc(uploads.statusChangedAt), desc(uploads.receivedAt))
    .limit(ERRORS_SHOWN);
}

async function measureObservationsSchema(): Promise<number> {
  const [size] = await db.execute<{ bytes: string | null }>(sql`
    SELECT sum(pg_total_relation_size(c.oid))::bigint AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'observations' AND c.relkind IN ('r', 'm')
  `);
  return Number(size?.bytes ?? 0);
}

export async function loadEngineState(): Promise<EngineState> {
  const [instances, [waiting], [subtractions], ended, sitesWaiting, storedBytes, disk, settings, databaseBytes, errors, nightlyRuns, recentRuns] =
    await Promise.all([
      db.select().from(engineHeartbeats).orderBy(desc(engineHeartbeats.seenAt)).limit(HEARTBEATS_SHOWN),
      countWaitingUploads(),
      countDueSubtractions(),
      countEndedLastDay(),
      db.$count(dirtySites),
      readStoredBytes(),
      newUploadsStore().freeSpace(),
      loadCrowdSettings(),
      measureObservationsSchema(),
      latestUploadErrors(),
      selectRuns()
        .where(inArray(engineRuns.kind, NIGHTLY_ENGINE_RUN_KINDS))
        .orderBy(desc(engineRuns.createdAt), desc(engineRuns.id))
        .limit(NIGHTLY_RUNS_SHOWN),
      selectRuns()
        .where(notInArray(engineRuns.kind, [...NIGHTLY_ENGINE_RUN_KINDS]))
        .orderBy(desc(engineRuns.createdAt), desc(engineRuns.id))
        .limit(RECENT_RUNS_SHOWN),
    ]);
  const endedWith = (status: "processed" | "rejected") => ended.find((row) => row.status === status)?.ended ?? 0;

  return {
    instances: instances.map((row) => ({ instance: row.instance, startedAt: row.startedAt.toISOString(), seenAt: row.seenAt.toISOString() })),
    uploads: {
      waiting: waiting?.waiting ?? 0,
      oldestWaitingAt: waiting?.oldestWaitingAt?.toISOString() ?? null,
      subtractionsWaiting: subtractions?.due ?? 0,
      processedLastDay: endedWith("processed"),
      rejectedLastDay: endedWith("rejected"),
    },
    sitesWaiting,
    storage: { storedBytes, budgetBytes: settings.rawStorageBudgetGb * GIGABYTE, disk },
    databaseBytes,
    latestErrors: errors.flatMap(({ error, ...upload }) =>
      error === null ? [] : [{ ...upload, error, receivedAt: upload.receivedAt.toISOString() }],
    ),
    nightlyRuns: nightlyRuns.map(toEngineRun),
    recentRuns: recentRuns.map(toEngineRun),
  };
}
