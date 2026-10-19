import { officialImportRunApprovals, officialImportRunDatasets, officialImportRuns, officialRemapRuns, officialSources } from "@openbts/drizzle";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import db from "../../../database/psql.js";
import { UNIQUE_VIOLATION, isDatabaseError } from "../../../errors.js";
import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { HEARTBEAT_INTERVAL_MS, MAX_RUN_ATTEMPTS, STALE_HEARTBEAT_MINUTES } from "./config.js";
import type { ClaimedRun, RemapRun, RunScope } from "./types.js";

export type EnqueueRunInput = {
  sourceId: number;
  kind: ClaimedRun["kind"];
  trigger: "scheduled" | "manual" | "cli";
  isDryRun: boolean;
  datasetIds: readonly number[];
  requestedById: string | null;
  approvals: readonly { datasetId: number; slice: string; snapshotId: number }[];
  remap?: RemapRun;
};

type ClaimRow = Pick<ClaimedRun, "id" | "sourceId" | "sourceKey" | "kind" | "isDryRun" | "attempt"> & {
  state: "running" | "failed";
  startedAt: string;
};
type LeftoverRun = Pick<ClaimedRun, "id" | "sourceKey"> & { heartbeatAt: Date | null; claimableAt: Date | null };

const ABANDONED_RUN_ERROR = `Abandoned after ${MAX_RUN_ATTEMPTS} attempts`;

export class RunNotOwnedError extends Error {
  constructor(runId: string) {
    super(`Import run ${runId} belongs to another runner or is no longer running`);
  }
}

export async function enqueueRun(tx: DbTx, input: EnqueueRunInput): Promise<string> {
  if ((input.kind === "remap") !== (input.remap !== undefined)) throw new Error("A remap run, and no other, says which licensee it remaps");

  const [run] = await tx
    .insert(officialImportRuns)
    .values({
      sourceId: input.sourceId,
      kind: input.kind,
      trigger: input.trigger,
      isDryRun: input.isDryRun,
      state: "queued",
      requestedById: input.requestedById,
    })
    .returning({ id: officialImportRuns.id });
  if (!run) throw new Error("Failed to queue the import run");

  if (input.datasetIds.length > 0) {
    await tx.insert(officialImportRunDatasets).values(input.datasetIds.map((datasetId) => ({ runId: run.id, datasetId })));
  }
  if (input.approvals.length > 0) {
    await tx.insert(officialImportRunApprovals).values(input.approvals.map((approval) => ({ runId: run.id, ...approval })));
  }
  if (input.remap) await tx.insert(officialRemapRuns).values({ runId: run.id, ...input.remap });

  return run.id;
}

async function claimOldestRun(claimToken: string, onlyRunId: string | null): Promise<ClaimRow | undefined> {
  const onlyThatRun = onlyRunId === null ? sql`` : sql`AND run.id = ${onlyRunId}::uuid`;
  const [claimed] = await db.execute<ClaimRow>(sql`
    WITH candidate AS (
      SELECT run.id, source.key AS source_key
      FROM ${officialImportRuns} AS run
      JOIN ${officialSources} AS source ON source.id = run.source_id
      WHERE (
          run.state = 'queued'
          OR (run.state = 'running' AND run.heartbeat_at < now() - make_interval(mins => ${STALE_HEARTBEAT_MINUTES}::integer))
        )
        AND NOT EXISTS (
          SELECT 1 FROM ${officialImportRuns} AS other
          WHERE other.source_id = run.source_id AND other.id <> run.id AND other.state = 'running'
        )
        ${onlyThatRun}
      ORDER BY run.created_at, run.id
      LIMIT 1
      FOR UPDATE OF run SKIP LOCKED
    )
    UPDATE ${officialImportRuns} AS claimed
    SET state = (CASE WHEN claimed.attempt >= ${MAX_RUN_ATTEMPTS}::integer THEN 'failed' ELSE 'running' END)::official_run_state,
      error = CASE WHEN claimed.attempt >= ${MAX_RUN_ATTEMPTS}::integer THEN ${ABANDONED_RUN_ERROR}::text ELSE claimed.error END,
      claim_token = CASE WHEN claimed.attempt >= ${MAX_RUN_ATTEMPTS}::integer THEN NULL ELSE ${claimToken}::uuid END,
      attempt = CASE WHEN claimed.attempt >= ${MAX_RUN_ATTEMPTS}::integer THEN claimed.attempt ELSE claimed.attempt + 1 END,
      claimed_at = now(),
      heartbeat_at = now(),
      started_at = COALESCE(claimed.started_at, now()),
      finished_at = CASE WHEN claimed.attempt >= ${MAX_RUN_ATTEMPTS}::integer THEN now() ELSE claimed.finished_at END
    FROM candidate
    WHERE claimed.id = candidate.id
    RETURNING claimed.id, claimed.source_id AS "sourceId", candidate.source_key AS "sourceKey", claimed.kind, claimed.is_dry_run AS "isDryRun",
      claimed.attempt, claimed.state, to_char(claimed.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startedAt"
  `);

  return claimed;
}

async function claim(onlyRunId: string | null): Promise<ClaimedRun | null> {
  for (;;) {
    const claimToken = randomUUID();
    let claimed: ClaimRow | undefined;
    try {
      // eslint-disable-next-line no-await-in-loop
      claimed = await claimOldestRun(claimToken, onlyRunId);
    } catch (error) {
      if (isDatabaseError(error, UNIQUE_VIOLATION)) return null;
      throw error;
    }

    if (claimed === undefined) return null;
    if (claimed.state === "failed") continue;

    return {
      id: claimed.id,
      sourceId: claimed.sourceId,
      sourceKey: claimed.sourceKey,
      kind: claimed.kind,
      isDryRun: claimed.isDryRun,
      attempt: claimed.attempt,
      claimToken,
      startedAt: new Date(claimed.startedAt),
    };
  }
}

export function claimNextRun(): Promise<ClaimedRun | null> {
  return claim(null);
}

export function claimRun(runId: string): Promise<ClaimedRun | null> {
  return claim(runId);
}

export async function readLeftoverRuns(): Promise<LeftoverRun[]> {
  const running = await db
    .select({ id: officialImportRuns.id, sourceKey: officialSources.key, heartbeatAt: officialImportRuns.heartbeatAt })
    .from(officialImportRuns)
    .innerJoin(officialSources, eq(officialSources.id, officialImportRuns.sourceId))
    .where(eq(officialImportRuns.state, "running"));

  return running.map((run) => ({
    ...run,
    claimableAt: run.heartbeatAt === null ? null : new Date(run.heartbeatAt.getTime() + STALE_HEARTBEAT_MINUTES * 60_000),
  }));
}

export async function requireOwnership(tx: DbTx, run: ClaimedRun): Promise<void> {
  const [stored] = await tx
    .select({ claimToken: officialImportRuns.claimToken, state: officialImportRuns.state })
    .from(officialImportRuns)
    .where(eq(officialImportRuns.id, run.id))
    .for("update")
    .limit(1);
  if (stored?.claimToken !== run.claimToken || stored.state !== "running") throw new RunNotOwnedError(run.id);
}

export function inRunTransaction<Result>(scope: Pick<RunScope, "run" | "database">, work: (tx: DbTx) => Promise<Result>): Promise<Result> {
  return scope.database.transaction(async (tx) => {
    await requireOwnership(tx, scope.run);
    return work(tx);
  });
}

export async function touchHeartbeat(tx: DbTx, runId: string): Promise<void> {
  await tx
    .update(officialImportRuns)
    .set({ heartbeatAt: sql`now()` })
    .where(eq(officialImportRuns.id, runId));
}

export function startHeartbeat(run: ClaimedRun, onOwnershipLost: (error: RunNotOwnedError) => void): () => void {
  let isBeating = false;
  const timer = setInterval(() => {
    if (isBeating) return;

    isBeating = true;
    inRunTransaction({ run, database: db }, (tx) => touchHeartbeat(tx, run.id))
      .catch((error: unknown) => {
        if (error instanceof RunNotOwnedError) onOwnershipLost(error);
        else logger.warn("official.import.heartbeat", { runId: run.id, error });
      })
      .finally(() => {
        isBeating = false;
      });
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();

  return () => clearInterval(timer);
}

export async function finishRun(tx: DbTx, runId: string): Promise<void> {
  await tx
    .update(officialImportRuns)
    .set({ state: "done", finishedAt: sql`now()`, heartbeatAt: sql`now()` })
    .where(eq(officialImportRuns.id, runId));
}

export async function deleteRun(tx: DbTx, runId: string): Promise<void> {
  await tx.delete(officialImportRuns).where(eq(officialImportRuns.id, runId));
}

export async function failRun(tx: DbTx, runId: string, error: string): Promise<void> {
  await tx
    .update(officialImportRuns)
    .set({ state: "failed", error, finishedAt: sql`now()` })
    .where(eq(officialImportRuns.id, runId));
}

export async function releaseRun(tx: DbTx, runId: string): Promise<void> {
  await tx.update(officialImportRuns).set({ state: "queued", claimToken: null }).where(eq(officialImportRuns.id, runId));
}

export async function cancelRun(tx: Pick<DbTx, "update">, runId: string): Promise<boolean> {
  const cancelled = await tx
    .update(officialImportRuns)
    .set({ state: "cancelled", finishedAt: sql`now()` })
    .where(and(eq(officialImportRuns.id, runId), inArray(officialImportRuns.state, ["queued", "running"])))
    .returning({ id: officialImportRuns.id });

  return cancelled.length > 0;
}
