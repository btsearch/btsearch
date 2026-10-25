import { engineRuns, users } from "@openbts/drizzle";
import { engineRunProgressSchema, engineRunSchema } from "@openbts/shared/contract";
import type { EngineRun, EngineRunCreate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { actorIdFromRequest } from "../../access/access.js";
import { wakeEngine } from "../../measurements/engineRuns.js";
import { toUserRef } from "../../users/userRef.js";

const runProgressSchema = engineRunProgressSchema.nullable().catch(null);

export function selectRuns() {
  return db
    .select({ run: engineRuns, requestedBy: { id: users.id, username: users.username, name: users.name, image: users.image } })
    .from(engineRuns)
    .leftJoin(users, eq(users.id, engineRuns.requestedById));
}

export function toEngineRun({ run, requestedBy }: Awaited<ReturnType<typeof selectRuns>>[number]): EngineRun {
  return engineRunSchema.parse({
    id: run.id,
    kind: run.kind,
    params: run.params,
    requestedBy: requestedBy === null ? null : toUserRef(requestedBy),
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    outcome: run.outcome,
    progress: runProgressSchema.parse(run.progress),
    error: run.error,
  });
}

export async function findEngineRun(id: string): Promise<EngineRun> {
  const [row] = await selectRuns().where(eq(engineRuns.id, id)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  return toEngineRun(row);
}

export async function startEngineRun(req: FastifyRequest, body: EngineRunCreate): Promise<EngineRun> {
  const params = "params" in body ? body.params : {};
  const id = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(engineRuns)
      .values({ kind: body.kind, params, requestedById: actorIdFromRequest(req) })
      .returning({ id: engineRuns.id });
    if (!run) throw new ErrorResponse("FAILED_TO_CREATE");
    await wakeEngine(tx);
    return run.id;
  });
  return findEngineRun(id);
}
