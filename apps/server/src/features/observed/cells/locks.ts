import { observedCells } from "@openbts/drizzle";
import { asc, inArray, sql } from "drizzle-orm";

import type { DbTx } from "../../../types/global.js";

const MATCHER_LOCK = 0x0b75_c0de_0003;

export const LOCKED_CELL_COLUMNS = {
  id: observedCells.id,
  plmn: observedCells.plmn,
  rat: observedCells.rat,
  cellKey: observedCells.cellKey,
  observedSiteId: observedCells.observedSiteId,
};

export async function lockMatcher(tx: DbTx): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${MATCHER_LOCK}::bigint)`);
}

export async function lockObservedCells(tx: DbTx, observedCellIds: readonly number[], strength: "key share" | "no key update") {
  return tx
    .select(LOCKED_CELL_COLUMNS)
    .from(observedCells)
    .where(inArray(observedCells.id, [...observedCellIds]))
    .orderBy(asc(observedCells.id))
    .for(strength);
}

export type LockedCell = Awaited<ReturnType<typeof lockObservedCells>>[number];
