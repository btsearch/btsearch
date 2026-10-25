import { blockedQuirkRules, quirkRules, users } from "@openbts/drizzle";
import type { MeasurementQuirkRule, MeasurementQuirkRuleUpdate } from "@openbts/shared/contract";
import { asc, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { actorIdFromRequest } from "../../access/access.js";
import { runAuditedOperation, standaloneAuditContext } from "../../audit/index.js";
import { toUserRef } from "../../users/userRef.js";
import { queueRefold } from "../engineRuns.js";

type QuirkRuleRow = Awaited<ReturnType<typeof selectQuirkRules>>[number];

function selectQuirkRules() {
  return db
    .select({
      rule: quirkRules,
      block: { reason: blockedQuirkRules.reason, blockedAt: blockedQuirkRules.blockedAt },
      blockedBy: { id: users.id, username: users.username, name: users.name, image: users.image },
    })
    .from(quirkRules)
    .leftJoin(blockedQuirkRules, eq(blockedQuirkRules.quirkRuleId, quirkRules.id))
    .leftJoin(users, eq(users.id, blockedQuirkRules.blockedById));
}

function toQuirkRuleBlock({ block, blockedBy }: QuirkRuleRow): MeasurementQuirkRule["block"] {
  if (block === null) return null;
  return { reason: block.reason, by: blockedBy === null ? null : toUserRef(blockedBy), at: block.blockedAt.toISOString() };
}

function toQuirkRule(row: QuirkRuleRow): MeasurementQuirkRule {
  return { id: row.rule.id, reader: row.rule.readerName, firstSeenAt: row.rule.firstSeenAt.toISOString(), block: toQuirkRuleBlock(row) };
}

export async function listQuirkRules(): Promise<MeasurementQuirkRule[]> {
  const rows = await selectQuirkRules().orderBy(asc(quirkRules.readerName), asc(quirkRules.id));
  return rows.map(toQuirkRule);
}

async function findQuirkRule(id: string): Promise<MeasurementQuirkRule> {
  const [row] = await selectQuirkRules().where(eq(quirkRules.id, id)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  return toQuirkRule(row);
}

export async function updateQuirkRule(req: FastifyRequest, id: string, change: MeasurementQuirkRuleUpdate): Promise<MeasurementQuirkRule> {
  await findQuirkRule(id);
  const spec = { kind: "observations.quirk_rule_block", allowEmpty: change.refold === true } as const;
  await runAuditedOperation(standaloneAuditContext(req), spec, async (tx, audit) => {
    if (change.block === null) {
      const [unblocked] = await tx.delete(blockedQuirkRules).where(eq(blockedQuirkRules.quirkRuleId, id)).returning();
      if (unblocked) await audit.log({ entity: "blocked_quirk_rules", op: "delete", recordId: id, old: unblocked });
    } else if (change.block !== undefined) {
      const [blocked] = await tx
        .insert(blockedQuirkRules)
        .values({ quirkRuleId: id, reason: change.block.reason, blockedById: actorIdFromRequest(req) })
        .onConflictDoNothing()
        .returning();
      if (blocked) await audit.log({ entity: "blocked_quirk_rules", op: "create", recordId: id, new: blocked });
    }
    if (change.refold === true) await queueRefold(tx, { quirkRuleId: id });
  });
  return findQuirkRule(id);
}
