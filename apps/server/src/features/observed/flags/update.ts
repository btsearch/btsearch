import { observationFlags } from "@openbts/drizzle";
import type { ObservationFlag, ObservationFlagConflict, ObservationFlagUpdate } from "@openbts/shared/contract";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { DetailedErrorResponse, ErrorResponse } from "../../../errors.js";
import type { DbTx } from "../../../types/global.js";
import { type ActorAccess, accessFromRequest, actorIdFromRequest } from "../../access/access.js";
import { defineScope } from "../../access/scope.js";
import { runAuditedOperation, standaloneAuditContext } from "../../audit/index.js";
import { assertObservationsOn } from "../access.js";
import { FLAG_KINDS } from "./kinds.js";
import { selectFlags, serializeFlags } from "./serialize.js";
import { closedFlagValues, flagStatusOf } from "./sync.js";

type LockedFlag = NonNullable<Awaited<ReturnType<typeof lockFlag>>>;

const RESOLVED_MESSAGE = "The flag is resolved";
const OPEN_TWIN_MESSAGE = "Another flag of the same kind is open for the same subject";

export const observationFlagScope = defineScope<{ Params: { id: number } }>(async (req) => {
  const [flag] = await db
    .select({ stationId: observationFlags.stationId, countryCode: observationFlags.countryCode, regionId: observationFlags.regionId })
    .from(observationFlags)
    .where(eq(observationFlags.id, req.params.id))
    .limit(1);
  if (flag === undefined) throw new ErrorResponse("NOT_FOUND");
  if (flag.stationId !== null) return { stationIds: [flag.stationId] };
  return { targets: [{ countryCode: flag.countryCode, regionId: flag.regionId }] };
});

function canSee(access: ActorAccess | null, { kind, countryCode }: LockedFlag): boolean {
  if (access?.role === "admin") return true;
  switch (FLAG_KINDS[kind].seenBy) {
    case "area":
      return access !== null;
    case "maintainers":
      return access?.grants.some((grant) => grant.isMaintainer && grant.countryCode === countryCode) === true;
    case "admins":
      return false;
  }
}

async function lockFlag(tx: DbTx, id: number) {
  const [flag] = await tx.select().from(observationFlags).where(eq(observationFlags.id, id)).limit(1).for("update");
  return flag;
}

async function findOtherOpenFlag(tx: DbTx, { id, kind, subjectKey }: LockedFlag): Promise<number | undefined> {
  const [open] = await tx
    .select({ id: observationFlags.id })
    .from(observationFlags)
    .where(
      and(
        eq(observationFlags.kind, kind),
        eq(observationFlags.subjectKey, subjectKey),
        isNull(observationFlags.closedReason),
        ne(observationFlags.id, id),
      ),
    )
    .limit(1);
  return open?.id;
}

function conflict(detail: ObservationFlagConflict, message: string): DetailedErrorResponse {
  return new DetailedErrorResponse("CONFLICT", [detail], { message });
}

async function planChange(tx: DbTx, flag: LockedFlag, change: ObservationFlagUpdate, resolvedById: string | null) {
  const status = flagStatusOf(flag.closedReason);
  if (status === "resolved") throw conflict({ kind: "resolved" }, RESOLVED_MESSAGE);

  if (change.status === "dismissed") {
    const note = change.note ?? null;
    if (status === "dismissed" && flag.dismissedReason === change.dismissedReason && flag.note === note) return null;
    return { ...closedFlagValues("dismissed", resolvedById), dismissedReason: change.dismissedReason, note };
  }

  if (status === "open") return null;
  const openFlagId = await findOtherOpenFlag(tx, flag);
  if (openFlagId !== undefined) throw conflict({ kind: "openFlag", observationFlagId: openFlagId }, OPEN_TWIN_MESSAGE);
  return {
    closedReason: null,
    dismissedReason: null,
    resolvedAt: null,
    resolvedById: null,
    note: null,
    updatedAt: sql`now()`,
  };
}

export async function updateFlag(req: FastifyRequest, id: number, change: ObservationFlagUpdate): Promise<ObservationFlag> {
  await assertObservationsOn(req);
  const access = await accessFromRequest(req);

  await runAuditedOperation(standaloneAuditContext(req), { kind: "observations.flag_update" }, async (tx, audit) => {
    const flag = await lockFlag(tx, id);
    if (flag === undefined || !canSee(access, flag)) throw new ErrorResponse("NOT_FOUND");

    const next = await planChange(tx, flag, change, actorIdFromRequest(req));
    if (next === null) return;

    const [updated] = await tx.update(observationFlags).set(next).where(eq(observationFlags.id, id)).returning();
    await audit.log({ entity: "observation_flags", op: "update", recordId: id, stationId: flag.stationId, old: flag, new: updated });
  });

  const [row] = await selectFlags().where(eq(observationFlags.id, id)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  const [flag] = await serializeFlags(req, [row]);
  if (flag === undefined) throw new ErrorResponse("INTERNAL_SERVER_ERROR");
  return flag;
}
