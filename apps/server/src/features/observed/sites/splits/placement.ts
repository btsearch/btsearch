/* oxlint-disable no-await-in-loop */
import { observedCells, observedSites, siteLinks } from "@openbts/drizzle";
import { CELL_MATCH_LIMIT } from "@openbts/shared/contract";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import db from "../../../../database/psql.js";
import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { logger } from "../../../../utils/logger.js";
import { type NrConventions, findNrConventions } from "../../../analyzer/match.js";
import { CELLS_PER_ENB, gnbidOf } from "../../cells/identity.js";
import { type LockedCell, lockMatcher, lockObservedCells } from "../../cells/locks.js";
import { loadEstimatePoints } from "../estimatePoints.js";
import { linkSites } from "../links.js";
import { type CellMove, markSitesDirty, moveCells } from "../moves.js";
import { type Node, type NodeSite, findLiveSitesOfNodes, findOrCreateNodeSites, nodeKey, placeKey } from "../nodes.js";
import { findStationsOfCells, loadCentres, nearestTo } from "./parts.js";

const STRANDED_CELLS_WITHIN = "1 day";

type CellWithoutSite = Pick<LockedCell, "id" | "plmn" | "rat" | "cellKey">;

async function findDecidedStationsOfSites(tx: DbTx, siteIds: readonly number[]): Promise<Map<number, number>> {
  const links = await tx
    .select({ observedSiteId: siteLinks.observedSiteId, stationId: siteLinks.stationId, kind: siteLinks.kind, linkedById: siteLinks.linkedById })
    .from(siteLinks)
    .where(inArray(siteLinks.observedSiteId, [...siteIds]));
  const decided = links.filter((link) => link.kind === "matched" || link.linkedById !== null);
  return new Map(decided.map((link) => [link.observedSiteId, link.stationId]));
}

export async function chooseParts(tx: DbTx, cells: readonly LockedCell[], partsOf: (cell: LockedCell) => readonly NodeSite[]): Promise<CellMove[]> {
  if (cells.length === 0) return [];

  const cellIds = cells.map((cell) => cell.id);
  const partIds = unique(cells.flatMap((cell) => partsOf(cell).map((part) => part.id)));
  const [stationOfCell, stationOfPart, estimates, centres] = await Promise.all([
    findStationsOfCells(tx, cellIds),
    findDecidedStationsOfSites(tx, partIds),
    loadEstimatePoints(tx, partIds),
    loadCentres(tx, cellIds),
  ]);
  return cells.flatMap((cell): CellMove[] => {
    const parts = partsOf(cell);
    const stationId = stationOfCell.get(cell.id);
    const linked = parts.find((part) => stationId !== undefined && stationOfPart.get(part.id) === stationId);
    const nearest = nearestTo(
      centres.get(cell.id),
      parts.map((part) => ({ part, point: estimates.get(part.id)?.point ?? null })),
    )?.part;
    const [lowest] = parts.toSorted((a, b) => a.place - b.place);
    const chosen = linked ?? nearest ?? lowest;
    return chosen === undefined ? [] : [{ cell, siteId: chosen.id }];
  });
}

async function giveLteCellsTheirNodeSite(tx: DbTx, lteCells: readonly LockedCell[]): Promise<CellMove[]> {
  const placeOf = (cell: LockedCell) => ({ plmn: cell.plmn, rat: cell.rat, nodeId: Math.floor(cell.cellKey / CELLS_PER_ENB), place: 0 });
  const siteIdOf = await findOrCreateNodeSites(tx, lteCells.map(placeOf));
  return lteCells.map((cell) => {
    const siteId = siteIdOf.get(placeKey(placeOf(cell)));
    if (siteId === undefined) throw new Error(`The site of the eNBID of observed cell ${cell.id} was neither created nor found`);
    return { cell, siteId };
  });
}

function nodeOf(cell: CellWithoutSite, nrConventions: ReadonlyMap<string, NrConventions>): Node | undefined {
  if (cell.rat === "LTE") return { plmn: cell.plmn, rat: cell.rat, nodeId: Math.floor(cell.cellKey / CELLS_PER_ENB) };
  const conventions = nrConventions.get(cell.plmn);
  if (conventions === undefined || conventions.nodeSpansSites) return undefined;
  return { plmn: cell.plmn, rat: cell.rat, nodeId: gnbidOf(cell.cellKey, conventions.gnbidLength) };
}

async function placeCells(cells: readonly CellWithoutSite[]): Promise<void> {
  const nrPlmns = unique(cells.filter((cell) => cell.rat === "NR").map((cell) => cell.plmn));
  const nrConventions = nrPlmns.length === 0 ? new Map<string, NrConventions>() : await findNrConventions(nrPlmns);
  const nodeOfCell = new Map(
    cells.flatMap((cell) => {
      const node = nodeOf(cell, nrConventions);
      return node === undefined ? [] : [[cell.id, node] as const];
    }),
  );
  if (nodeOfCell.size === 0) return;

  await db.transaction(async (tx) => {
    await lockMatcher(tx);
    const sitesOf = await findLiveSitesOfNodes(tx, [...nodeOfCell.values()]);
    const partsOf = (cell: Pick<LockedCell, "id">) => {
      const node = nodeOfCell.get(cell.id);
      return node === undefined ? [] : (sitesOf.get(nodeKey(node)) ?? []).filter((site) => site.place > 0);
    };
    const placeable = cells.filter((cell) => cell.rat === "LTE" || partsOf(cell).length > 0);
    if (placeable.length === 0) return;

    const locked = await lockObservedCells(
      tx,
      placeable.map((cell) => cell.id),
      "no key update",
    );
    const withoutSite = locked.filter((cell) => cell.observedSiteId === null);
    const ofSplitNodes = withoutSite.filter((cell) => partsOf(cell).length > 0);
    const ofNodesWithoutPlaces = withoutSite.filter((cell) => partsOf(cell).length === 0);
    const moves = [...(await chooseParts(tx, ofSplitNodes, partsOf)), ...(await giveLteCellsTheirNodeSite(tx, ofNodesWithoutPlaces))];
    const placedOn = unique(moves.map((move) => move.siteId));
    await moveCells(tx, moves);
    await linkSites(tx, placedOn);
    await markSitesDirty(tx, placedOn);
  });
}

export async function placeCellsOfSplitNodes(): Promise<void> {
  let afterId = 0;
  let cells: CellWithoutSite[];
  do {
    cells = await db
      .select({ id: observedCells.id, plmn: observedCells.plmn, rat: observedCells.rat, cellKey: observedCells.cellKey })
      .from(observedCells)
      .where(and(inArray(observedCells.rat, ["LTE", "NR"]), isNull(observedCells.observedSiteId), gt(observedCells.id, afterId)))
      .orderBy(asc(observedCells.id))
      .limit(CELL_MATCH_LIMIT);
    if (cells.length > 0) await placeCells(cells);
    afterId = cells.at(-1)?.id ?? afterId;
  } while (cells.length === CELL_MATCH_LIMIT);
}

export async function releaseLteCellsOfRetiredSites(): Promise<void> {
  const released = await db.transaction(async (tx) => {
    await lockMatcher(tx);
    const retiredSiteIds = tx
      .select({ id: observedSites.id })
      .from(observedSites)
      .where(gt(observedSites.retiredAt, sql`now() - ${STRANDED_CELLS_WITHIN}::interval`));
    const stranded = tx
      .select({ id: observedCells.id })
      .from(observedCells)
      .where(and(eq(observedCells.rat, "LTE"), inArray(observedCells.observedSiteId, retiredSiteIds)))
      .orderBy(asc(observedCells.id))
      .for("no key update");
    return tx.update(observedCells).set({ observedSiteId: null }).where(inArray(observedCells.id, stranded)).returning({ id: observedCells.id });
  });
  if (released.length > 0) logger.info("observations.cells.released_from_retired_sites", { cells: released.length });
}
