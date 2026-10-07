import { operatorLinks, operators, proposedStations, stations, statsSnapshots, submissions, ukeStations } from "@openbts/drizzle";
import { and, count, eq } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import type { AuditRecorder } from "../audit/index.js";
import { loadOperatorDetails } from "./details.js";
import { type OperatorRow, toOperator } from "./serialize.js";

export async function removeOperator(tx: DbTx, audit: AuditRecorder, operator: OperatorRow): Promise<void> {
  const [[station], [officialSite], [member], [pendingProposal], [snapshotCount], details] = await Promise.all([
    tx.select({ id: stations.id }).from(stations).where(eq(stations.operator_id, operator.id)).limit(1),
    tx.select({ id: ukeStations.id }).from(ukeStations).where(eq(ukeStations.operator_id, operator.id)).limit(1),
    tx.select({ id: operatorLinks.id }).from(operatorLinks).where(eq(operatorLinks.relatedOperatorId, operator.id)).limit(1),
    tx
      .select({ id: proposedStations.id })
      .from(proposedStations)
      .innerJoin(submissions, eq(submissions.id, proposedStations.submission_id))
      .where(and(eq(proposedStations.operator_id, operator.id), eq(submissions.status, "pending")))
      .limit(1),
    tx.select({ value: count() }).from(statsSnapshots).where(eq(statsSnapshots.operator_id, operator.id)),
    loadOperatorDetails(tx, [operator.id]),
  ]);
  if (station) throw new ErrorResponse("CONFLICT", { message: "Cannot delete an operator that still has stations" });
  if (officialSite) throw new ErrorResponse("CONFLICT", { message: "Cannot delete an operator that still has official sites and permits" });
  if (member) throw new ErrorResponse("CONFLICT", { message: "Cannot delete a shared network that still has member operators" });
  if (pendingProposal) throw new ErrorResponse("CONFLICT", { message: "Cannot delete an operator that a pending submission still names" });

  const { plmns, links } = toOperator(operator, details.get(operator.id));
  const metadata = { plmns, links, deleted_snapshot_count: snapshotCount?.value ?? 0 };
  await tx.delete(operators).where(eq(operators.id, operator.id));
  await audit.log({ entity: "operators", op: "delete", recordId: operator.id, old: operator, metadata });
}
