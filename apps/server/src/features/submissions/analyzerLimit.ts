import { submissions } from "@openbts/drizzle";
import { ANALYZER_SUBMISSIONS_LIMIT } from "@openbts/shared/contract";
import type { AnalyzerChangesLimit } from "@openbts/shared/contract";
import { and, count, eq, gt, min } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import { STAFF_ROLES } from "../../constants.js";
import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { RetryHeaders } from "../../lib/requestLimit.js";
import { sessionOrTokenAccessFromRequest } from "../access/staff.js";

const WINDOW_MS = ANALYZER_SUBMISSIONS_LIMIT.windowHours * 60 * 60 * 1000;

function isExempt(req: FastifyRequest, storedRole: string | undefined): boolean {
  const isSessionOrToken = Boolean(req.userSession?.user?.id);
  return isSessionOrToken && storedRole !== undefined && STAFF_ROLES.has(storedRole);
}

export async function findAnalyzerChangesLimit(
  req: FastifyRequest,
  userId: string,
  storedRole: string | undefined,
): Promise<AnalyzerChangesLimit | null> {
  if (isExempt(req, storedRole)) return null;

  const windowStart = new Date(Date.now() - WINDOW_MS);
  const [recent] = await db
    .select({ total: count(), oldestAt: min(submissions.createdAt) })
    .from(submissions)
    .where(and(eq(submissions.submitter_id, userId), eq(submissions.origin, "analyzer"), gt(submissions.createdAt, windowStart)));
  const oldestAt = recent?.oldestAt ?? null;

  return {
    limit: ANALYZER_SUBMISSIONS_LIMIT.max,
    remaining: Math.max(0, ANALYZER_SUBMISSIONS_LIMIT.max - (recent?.total ?? 0)),
    resetsAt: oldestAt === null ? null : new Date(oldestAt.getTime() + WINDOW_MS).toISOString(),
  };
}

export async function assertAnalyzerLimit(req: FastifyRequest, res: RetryHeaders, userId: string, incoming: number): Promise<void> {
  if (incoming === 0) return;

  const access = await sessionOrTokenAccessFromRequest(req);
  const allowance = await findAnalyzerChangesLimit(req, userId, access?.role);
  if (allowance === null || incoming <= allowance.remaining) return;

  const freesAt = allowance.resetsAt === null ? Date.now() + WINDOW_MS : Date.parse(allowance.resetsAt);
  res.header("X-Retry-After", String(Math.max(1, Math.ceil((freesAt - Date.now()) / 1000))));
  throw new ErrorResponse("TOO_MANY_REQUESTS", {
    message: `At most ${ANALYZER_SUBMISSIONS_LIMIT.max} analyzer changes in ${ANALYZER_SUBMISSIONS_LIMIT.windowHours} hours`,
  });
}
