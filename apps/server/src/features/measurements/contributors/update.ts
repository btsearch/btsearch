import { contributorBlocks, contributors, vouches } from "@openbts/drizzle";
import type { MeasurementContributor, MeasurementContributorUpdate } from "@openbts/shared/contract";
import { eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import { ErrorResponse, ValidationError } from "../../../errors.js";
import type { DbTx } from "../../../types/global.js";
import { actorIdFromRequest } from "../../access/access.js";
import { type AuditRecorder, runAuditedOperation, standaloneAuditContext } from "../../audit/index.js";
import { queueRefold } from "../engineRuns.js";
import { findContributor } from "./read.js";

type VouchChange = Exclude<MeasurementContributorUpdate["vouch"], undefined>;
type BlockChange = Exclude<MeasurementContributorUpdate["block"], undefined>;

function sameInstant(stored: Date | null, wanted: Date | null): boolean {
  return (stored?.getTime() ?? null) === (wanted?.getTime() ?? null);
}

async function writeVouch(tx: DbTx, audit: AuditRecorder, userId: string, actorId: string | null, vouch: VouchChange): Promise<void> {
  const [existing] = await tx.select().from(vouches).where(eq(vouches.userId, userId));
  if (vouch === null) {
    if (!existing) return;
    await tx.delete(vouches).where(eq(vouches.userId, userId));
    await audit.log({ entity: "vouches", op: "delete", recordId: userId, old: existing });
    return;
  }

  const values = {
    weight: vouch.weight,
    confirmsAlone: vouch.confirmsAlone,
    reason: vouch.reason,
    until: vouch.endsAt === undefined ? null : new Date(vouch.endsAt),
    vouchedById: actorId,
  };
  const isSame =
    existing !== undefined &&
    Math.fround(existing.weight) === Math.fround(values.weight) &&
    existing.confirmsAlone === values.confirmsAlone &&
    existing.reason === values.reason &&
    sameInstant(existing.until, values.until);
  if (isSame) return;

  const [saved] = await tx
    .insert(vouches)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: vouches.userId, set: { ...values, vouchedAt: sql`now()` } })
    .returning();
  await audit.log({ entity: "vouches", op: existing ? "update" : "create", recordId: userId, old: existing, new: saved });
}

async function writeBlock(tx: DbTx, audit: AuditRecorder, userId: string, actorId: string | null, block: BlockChange): Promise<void> {
  const [existing] = await tx.select().from(contributorBlocks).where(eq(contributorBlocks.userId, userId));
  if (block === null) {
    if (!existing) return;
    await tx.delete(contributorBlocks).where(eq(contributorBlocks.userId, userId));
    await audit.log({ entity: "contributor_blocks", op: "delete", recordId: userId, old: existing });
    return;
  }

  const values = { reason: block.reason, until: block.endsAt === undefined ? null : new Date(block.endsAt), blockedById: actorId };
  if (existing !== undefined && existing.reason === values.reason && sameInstant(existing.until, values.until)) return;

  const [saved] = await tx
    .insert(contributorBlocks)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: contributorBlocks.userId, set: { ...values, blockedAt: sql`now()` } })
    .returning();
  await audit.log({ entity: "contributor_blocks", op: existing ? "update" : "create", recordId: userId, old: existing, new: saved });
}

function assertInFuture(field: string, endsAt: string | undefined): void {
  if (endsAt !== undefined && new Date(endsAt).getTime() <= Date.now()) {
    throw new ValidationError([{ field, validationMessage: "Must lie in the future" }]);
  }
}

export async function updateContributor(req: FastifyRequest, userId: string, change: MeasurementContributorUpdate): Promise<MeasurementContributor> {
  assertInFuture("vouch.endsAt", change.vouch?.endsAt);
  assertInFuture("block.endsAt", change.block?.endsAt);
  const kind = change.block === undefined ? "observations.contributor_vouch" : "observations.contributor_block";
  await runAuditedOperation(standaloneAuditContext(req), { kind, allowEmpty: change.refold === true }, async (tx, audit) => {
    const [contributor] = await tx.select({ userId: contributors.userId }).from(contributors).where(eq(contributors.userId, userId)).for("update");
    if (!contributor) throw new ErrorResponse("NOT_FOUND");

    const actorId = actorIdFromRequest(req);
    if (change.vouch !== undefined) await writeVouch(tx, audit, userId, actorId, change.vouch);
    if (change.block !== undefined) await writeBlock(tx, audit, userId, actorId, change.block);
    if (change.refold === true) await queueRefold(tx, { userId });
  });
  return findContributor(userId);
}
