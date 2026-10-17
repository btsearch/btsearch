import type { OperatorRef } from "@openbts/country-packs";
import { operatorLinks, operators, plmns } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";
import { loadOperators } from "./details.js";
import { toOperator } from "./serialize.js";

type Reader = Pick<DbTx, "select">;
export type LocatedOperatorRef = OperatorRef & { countryCode: string };

async function loadSharedNetworkPlmns(memberIds: readonly number[], reader: Reader): Promise<Map<number, string | null>> {
  const sharedNetworkIds = db
    .select({ id: operatorLinks.relatedOperatorId })
    .from(operatorLinks)
    .where(and(inArray(operatorLinks.operatorId, [...memberIds]), eq(operatorLinks.kind, "jv_member")));
  const [rows, plmnRows] = await Promise.all([
    reader.select().from(operators).where(inArray(operators.id, sharedNetworkIds)),
    reader
      .select({ operatorId: plmns.operatorId, mcc: plmns.mcc, mnc: plmns.mnc, code: plmns.code, role: plmns.role })
      .from(plmns)
      .where(inArray(plmns.operatorId, sharedNetworkIds)),
  ]);

  const plmnRowsByOperator = Map.groupBy(plmnRows, (plmn) => plmn.operatorId);
  return new Map(rows.map((row) => [row.id, toOperator(row, { plmns: plmnRowsByOperator.get(row.id) ?? [], links: [] }).primaryPlmn]));
}

export async function loadOperatorRefs(operatorIds: readonly number[], reader: Reader = db): Promise<Map<number, LocatedOperatorRef>> {
  if (operatorIds.length === 0) return new Map();

  const [members, plmnBySharedNetwork] = await Promise.all([loadOperators(reader, operatorIds), loadSharedNetworkPlmns(operatorIds, reader)]);
  return new Map(
    [...members.values()].map(({ id, countryCode, primaryPlmn, links }) => {
      const sharedNetworkIds = links.filter((link) => link.kind === "jvMember").map((link) => link.operatorId);
      const sharedNetworkPlmns = unique(sharedNetworkIds.map((networkId) => plmnBySharedNetwork.get(networkId)));
      return [id, { id, countryCode, primaryPlmn, sharedNetworkPlmns }];
    }),
  );
}
