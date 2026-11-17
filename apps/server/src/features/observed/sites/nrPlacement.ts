/* oxlint-disable no-await-in-loop */
import { observedCells, observedSites } from "@openbts/drizzle";
import { type SQL, and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { chunks, unique } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { findNrConventions } from "../../analyzer/match.js";
import { NCI_BITS, gnbidOf } from "../cells/identity.js";
import { LOCKED_CELL_COLUMNS, type LockedCell, lockMatcher } from "../cells/locks.js";
import { isGsmUmtsCell, placeGsmUmtsCells } from "./gsmUmtsPlacement.js";
import { linkSites } from "./links.js";
import { ROWS_PER_QUERY, markSitesDirty, moveCells, recordReplacements } from "./moves.js";
import { type Node, type NodePlace, type NodeSite, findOrCreateNodeSites, findPlacesOfNodes, nodeKey, placeKey } from "./nodes.js";
import { chooseParts } from "./splits/placement.js";

type NrSiteRule = { plmn: string; gnbidLength: number; nodeSpansSites: boolean };

async function findNrSiteRules(plmns: readonly string[]): Promise<NrSiteRule[]> {
  const conventions = await findNrConventions(plmns);
  return [...conventions].map(([plmn, convention]) => ({ plmn, ...convention }));
}

function gnbOf(cell: LockedCell, { plmn, gnbidLength }: NrSiteRule): Node {
  return { plmn, rat: "NR", nodeId: gnbidOf(cell.cellKey, gnbidLength) };
}

function nrSiteOf(cell: LockedCell, { plmn, gnbidLength, nodeSpansSites }: NrSiteRule): NodePlace {
  const nodeId = gnbidOf(cell.cellKey, gnbidLength);
  return { plmn, rat: "NR", nodeId, place: nodeSpansSites ? cell.cellKey - nodeId * 2 ** (NCI_BITS - gnbidLength) + 1 : 0 };
}

export async function giveNrCellsSites(): Promise<void> {
  const isNrCellWithoutSite = and(eq(observedCells.rat, "NR"), isNull(observedCells.observedSiteId));
  const networks = await db.selectDistinct({ plmn: observedCells.plmn }).from(observedCells).where(isNrCellWithoutSite);
  if (networks.length === 0) return;

  const rules = await findNrSiteRules(networks.map((network) => network.plmn));
  for (const rule of rules) await db.transaction((tx) => cutSites(tx, rule, isNrCellWithoutSite));
}

export async function recutNrSites(): Promise<void> {
  const networks = await db
    .selectDistinct({ plmn: observedSites.plmn })
    .from(observedSites)
    .where(and(eq(observedSites.rat, "NR"), isNull(observedSites.retiredAt)));
  if (networks.length === 0) return;

  const rules = await findNrSiteRules(networks.map((network) => network.plmn));
  for (const rule of rules) {
    const clidBits = NCI_BITS - rule.gnbidLength;
    const isNodeCutOtherwise = ne(observedSites.nodeId, sql`${observedCells.cellKey} >> ${clidBits}`);
    const isPlaceCutOtherwise = ne(observedSites.place, sql`(${observedCells.cellKey} & ${2 ** clidBits - 1}) + 1`);
    const sitesCutOtherwise = db
      .selectDistinct({ id: observedSites.id })
      .from(observedCells)
      .innerJoin(observedSites, eq(observedSites.id, observedCells.observedSiteId))
      .where(
        and(
          eq(observedCells.plmn, rule.plmn),
          eq(observedCells.rat, "NR"),
          rule.nodeSpansSites ? or(isNodeCutOtherwise, isPlaceCutOtherwise) : isNodeCutOtherwise,
        ),
      );
    const retired = await db.transaction((tx) => cutSites(tx, rule, inArray(observedCells.observedSiteId, sitesCutOtherwise)));
    if (retired > 0) logger.info("observations.nr_sites.recut", { plmn: rule.plmn, gnbidLength: rule.gnbidLength, retired });
  }
}

async function findPartsOfGnbs(tx: DbTx, rule: NrSiteRule, nrCells: readonly LockedCell[]): Promise<Map<string, NodeSite[]>> {
  if (rule.nodeSpansSites) return new Map();
  return findPlacesOfNodes(
    tx,
    nrCells.map((cell) => gnbOf(cell, rule)),
  );
}

async function cutSites(tx: DbTx, rule: NrSiteRule, whichCells: SQL | undefined): Promise<number> {
  await lockMatcher(tx);
  const locked = await tx
    .select(LOCKED_CELL_COLUMNS)
    .from(observedCells)
    .where(and(eq(observedCells.plmn, rule.plmn), whichCells))
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

  const partsOfGnb = await findPartsOfGnbs(tx, rule, nrCells);
  const partsOf = (cell: LockedCell) => partsOfGnb.get(nodeKey(gnbOf(cell, rule))) ?? [];
  const sited = nrCells.filter((cell) => partsOf(cell).length === 0).map((cell) => ({ cell, site: nrSiteOf(cell, rule) }));
  const siteIdOf = await findOrCreateNodeSites(
    tx,
    sited.map(({ site }) => site),
  );
  const moves = [
    ...sited.map(({ cell, site }) => {
      const siteId = siteIdOf.get(placeKey(site));
      if (siteId === undefined) throw new Error(`The NR site ${placeKey(site)} was neither created nor found`);
      return { cell, siteId };
    }),
    ...(await chooseParts(
      tx,
      nrCells.filter((cell) => partsOf(cell).length > 0),
      partsOf,
    )),
  ];
  await moveCells(tx, moves);
  await recordReplacements(tx, moves, new Set(retiredSiteIds));

  const placed = await placeGsmUmtsCells(tx, locked.filter(isGsmUmtsCell));
  const nrSiteIds = unique(moves.map((move) => move.siteId));
  for (const ids of chunks(unique([...nrSiteIds, ...placed.changedSiteIds]), ROWS_PER_QUERY)) await linkSites(tx, ids);
  await markSitesDirty(tx, unique([...retiredSiteIds, ...nrSiteIds, ...placed.changedSiteIds]));
  return retiredSiteIds.length;
}
