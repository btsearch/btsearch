/* oxlint-disable no-await-in-loop */
import { observedSites, siteSplits } from "@openbts/drizzle";
import { and, eq, notExists } from "drizzle-orm";

import db from "../../../../database/psql.js";
import type { DbTx } from "../../../../types/global.js";
import { logger } from "../../../../utils/logger.js";
import { type LockedCell, lockMatcher } from "../../cells/locks.js";
import type { PlacedCell } from "../../cells/servingCentres.js";
import { NODE_SITE_COLUMNS, type NodeSite, isLiveNodeSite } from "../nodes.js";
import { addToNearestPart, findCopiesOf, loadCentres, lockCellsOfSites, splitSites } from "./parts.js";
import { findCellsAtStations, placeOfCells } from "./stations.js";

function partsShareAPlace(parts: readonly LockedCell[][], placeOfCell: ReadonlyMap<number, number>): boolean {
  const placesOfParts = parts.map((members) => new Set(members.flatMap((cell) => placeOfCell.get(cell.id) ?? [])));
  return placesOfParts.some((places, index) => placesOfParts.slice(index + 1).some((other) => [...places].some((place) => other.has(place))));
}

async function applySiteSplit(tx: DbTx, site: NodeSite): Promise<boolean> {
  await lockMatcher(tx);
  const locked = await lockCellsOfSites(tx, [site.id]);
  const proposal = await tx
    .delete(siteSplits)
    .where(eq(siteSplits.observedSiteId, site.id))
    .returning({ observedCellId: siteSplits.observedCellId, part: siteSplits.part });

  const cellById = new Map(locked.map((cell) => [cell.id, cell]));
  const onSite = proposal.filter((row) => cellById.has(row.observedCellId));
  const proposed = new Set(onSite.map((row) => row.observedCellId));
  const parts = [...Map.groupBy(onSite, (row) => row.part)]
    .toSorted(([a], [b]) => a - b)
    .map(([, rows]) => rows.flatMap((row) => cellById.get(row.observedCellId) ?? []));
  if (parts.length < 2) return false;

  const unproposed = locked.filter((cell) => !proposed.has(cell.id));
  const copies = await findCopiesOf(
    tx,
    unproposed.map((cell) => cell.id),
  );
  const arrivedAfterEstimate = copies.length < unproposed.length;
  if (arrivedAfterEstimate) return false;

  const placeOfCell = placeOfCells(await findCellsAtStations(tx, [site.id]));
  if (partsShareAPlace(parts, placeOfCell)) return false;

  const centres =
    unproposed.length === 0
      ? new Map<number, PlacedCell>()
      : await loadCentres(
          tx,
          locked.map((cell) => cell.id),
        );
  await splitSites(tx, [{ site, parts: addToNearestPart(parts, unproposed, centres) }]);
  return true;
}

export async function applySiteSplits(): Promise<void> {
  const liveNodeSite = db
    .select({ id: observedSites.id })
    .from(observedSites)
    .where(and(eq(observedSites.id, siteSplits.observedSiteId), isLiveNodeSite));
  await db.delete(siteSplits).where(notExists(liveNodeSite));
  const proposed = await db
    .selectDistinct(NODE_SITE_COLUMNS)
    .from(siteSplits)
    .innerJoin(observedSites, and(eq(observedSites.id, siteSplits.observedSiteId), isLiveNodeSite));
  if (proposed.length === 0) return;

  let split = 0;
  for (const site of proposed) {
    if (await db.transaction((tx) => applySiteSplit(tx, site))) split += 1;
  }
  logger.info("observations.sites.split_by_engine", { proposed: proposed.length, split });
}
