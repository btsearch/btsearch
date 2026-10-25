/* oxlint-disable no-await-in-loop */
import { observedCells, observedSites } from "@openbts/drizzle";
import { type SQL, and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { chunks, unique } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { findGnbidLengths } from "../../analyzer/match.js";
import { NCI_BITS, gnbidOf } from "../cells/identity.js";
import { LOCKED_CELL_COLUMNS, lockMatcher } from "../cells/locks.js";
import { isGsmUmtsCell, placeGsmUmtsCells } from "./gsmUmtsPlacement.js";
import { linkSites } from "./links.js";
import { ROWS_PER_QUERY, markSitesDirty, moveCells, recordReplacements } from "./moves.js";

export async function giveNrCellsSites(): Promise<void> {
  const isNrCellWithoutSite = and(eq(observedCells.rat, "NR"), isNull(observedCells.observedSiteId));
  const networks = await db.selectDistinct({ plmn: observedCells.plmn }).from(observedCells).where(isNrCellWithoutSite);
  if (networks.length === 0) return;

  const lengths = await findGnbidLengths(networks.map((network) => network.plmn));
  for (const [plmn, gnbidLength] of lengths) await db.transaction((tx) => cutSites(tx, plmn, gnbidLength, isNrCellWithoutSite));
}

export async function recutNrSites(): Promise<void> {
  const networks = await db
    .selectDistinct({ plmn: observedSites.plmn })
    .from(observedSites)
    .where(and(eq(observedSites.rat, "NR"), isNull(observedSites.retiredAt)));
  if (networks.length === 0) return;

  const lengths = await findGnbidLengths(networks.map((network) => network.plmn));
  for (const [plmn, gnbidLength] of lengths) {
    const sitesCutOtherwise = db
      .selectDistinct({ id: observedSites.id })
      .from(observedCells)
      .innerJoin(observedSites, eq(observedSites.id, observedCells.observedSiteId))
      .where(
        and(
          eq(observedCells.plmn, plmn),
          eq(observedCells.rat, "NR"),
          ne(observedSites.nodeId, sql`${observedCells.cellKey} >> ${NCI_BITS - gnbidLength}`),
        ),
      );
    const retired = await db.transaction((tx) => cutSites(tx, plmn, gnbidLength, inArray(observedCells.observedSiteId, sitesCutOtherwise)));
    if (retired > 0) logger.info("observations.nr_sites.recut", { plmn, gnbidLength, retired });
  }
}

async function cutSites(tx: DbTx, plmn: string, gnbidLength: number, whichCells: SQL | undefined): Promise<number> {
  await lockMatcher(tx);
  const locked = await tx
    .select(LOCKED_CELL_COLUMNS)
    .from(observedCells)
    .where(and(eq(observedCells.plmn, plmn), whichCells))
    .orderBy(asc(observedCells.id))
    .for("no key update");
  const nrCells = locked.filter((cell) => cell.rat === "NR");
  if (nrCells.length === 0) return 0;

  const retiredSiteIds = unique(nrCells.map((cell) => cell.observedSiteId));
  for (const ids of chunks(retiredSiteIds, ROWS_PER_QUERY)) {
    await tx
      .update(observedSites)
      .set({ retiredAt: sql`now()` })
      .where(inArray(observedSites.id, ids));
  }

  const cellsByGnbid = Map.groupBy(nrCells, (cell) => gnbidOf(cell.cellKey, gnbidLength));
  const siteIdOfGnbid = await findOrCreateNrSites(tx, plmn, [...cellsByGnbid.keys()]);
  const moves = [...cellsByGnbid].flatMap(([gnbid, members]) => {
    const siteId = siteIdOfGnbid.get(gnbid);
    if (siteId === undefined) throw new Error(`The NR site ${plmn}/${gnbid} was neither created nor found`);
    return members.map((cell) => ({ cell, siteId }));
  });
  await moveCells(tx, moves);
  await recordReplacements(tx, moves, new Set(retiredSiteIds));

  const placed = await placeGsmUmtsCells(tx, locked.filter(isGsmUmtsCell));
  const nrSiteIds = [...siteIdOfGnbid.values()];
  for (const ids of chunks(unique([...nrSiteIds, ...placed.changedSiteIds]), ROWS_PER_QUERY)) await linkSites(tx, ids);
  await markSitesDirty(tx, unique([...retiredSiteIds, ...nrSiteIds, ...placed.changedSiteIds]));
  return retiredSiteIds.length;
}

async function findOrCreateNrSites(tx: DbTx, plmn: string, gnbids: readonly number[]): Promise<Map<number, number>> {
  const siteIdOfGnbid = new Map<number, number>();
  for (const part of chunks(gnbids, ROWS_PER_QUERY)) {
    await tx
      .insert(observedSites)
      .values(part.map((nodeId) => ({ plmn, rat: "NR" as const, nodeId })))
      .onConflictDoNothing({ target: [observedSites.plmn, observedSites.rat, observedSites.nodeId], where: isNull(observedSites.retiredAt) });
    const sites = await tx
      .select({ id: observedSites.id, nodeId: observedSites.nodeId })
      .from(observedSites)
      .where(and(eq(observedSites.plmn, plmn), eq(observedSites.rat, "NR"), isNull(observedSites.retiredAt), inArray(observedSites.nodeId, part)));
    for (const { id, nodeId } of sites) {
      if (nodeId !== null) siteIdOfGnbid.set(nodeId, id);
    }
  }
  return siteIdOfGnbid;
}
