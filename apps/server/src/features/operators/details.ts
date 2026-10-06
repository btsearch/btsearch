import { operatorLinks, operators, plmns } from "@openbts/drizzle";
import type { Operator } from "@openbts/shared/contract";
import { asc, inArray } from "drizzle-orm";

import type { DbTx } from "../../types/global.js";
import { type OperatorDetails, toOperator } from "./serialize.js";

export async function loadOperatorDetails(client: Pick<DbTx, "select">, operatorIds: readonly number[]): Promise<Map<number, OperatorDetails>> {
  const details = new Map<number, OperatorDetails>(operatorIds.map((id) => [id, { plmns: [], links: [] }]));
  if (operatorIds.length === 0) return details;

  const [plmnRows, linkRows] = await Promise.all([
    client
      .select({ operatorId: plmns.operatorId, mcc: plmns.mcc, mnc: plmns.mnc, code: plmns.code, role: plmns.role })
      .from(plmns)
      .where(inArray(plmns.operatorId, [...operatorIds]))
      .orderBy(asc(plmns.role), asc(plmns.code)),
    client
      .select({ operatorId: operatorLinks.operatorId, kind: operatorLinks.kind, relatedOperatorId: operatorLinks.relatedOperatorId })
      .from(operatorLinks)
      .where(inArray(operatorLinks.operatorId, [...operatorIds]))
      .orderBy(asc(operatorLinks.kind), asc(operatorLinks.relatedOperatorId)),
  ]);

  for (const { operatorId, ...plmn } of plmnRows) details.get(operatorId)?.plmns.push(plmn);
  for (const { operatorId, ...link } of linkRows) details.get(operatorId)?.links.push(link);
  return details;
}

export async function loadOperators(client: Pick<DbTx, "select">, operatorIds: readonly number[]): Promise<Map<number, Operator>> {
  if (operatorIds.length === 0) return new Map();

  const [rows, details] = await Promise.all([
    client
      .select()
      .from(operators)
      .where(inArray(operators.id, [...operatorIds])),
    loadOperatorDetails(client, operatorIds),
  ]);
  return new Map(rows.map((row) => [row.id, toOperator(row, details.get(row.id))]));
}
