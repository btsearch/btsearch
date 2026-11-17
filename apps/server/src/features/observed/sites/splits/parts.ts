import { cellCopies, cellMatches, cells, locations, observedCells, observedSites, stations } from "@openbts/drizzle";
import { and, asc, eq, gt, inArray, max, sql } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { LOCKED_CELL_COLUMNS, type LockedCell } from "../../cells/locks.js";
import { type PlacedCell, loadServingCentres } from "../../cells/servingCentres.js";
import { metersBetween } from "../../flags/sites/flaggedSite.js";
import type { Point } from "../../tiles/squares.js";
import { linkSites } from "../links.js";
import { type CellMove, markSitesDirty, moveCells, recordReplacements } from "../moves.js";
import { NODE_SITE_COLUMNS, type NodeSite, isLiveNodeSite, isOfNodes, nodeKey, placeKey } from "../nodes.js";

export type SplitPlan = { site: NodeSite; parts: LockedCell[][] };
type PlacedPart = { siteId: number; members: readonly LockedCell[] };

export function lockCellsOfSites(tx: DbTx, siteIds: readonly number[]) {
  return tx
    .select(LOCKED_CELL_COLUMNS)
    .from(observedCells)
    .where(inArray(observedCells.observedSiteId, [...siteIds]))
    .orderBy(asc(observedCells.id))
    .for("no key update");
}

export async function findCopiesOf(tx: DbTx, observedCellIds: readonly number[]) {
  if (observedCellIds.length === 0) return [];

  return tx
    .select({ observedCellId: cellCopies.observedCellId, primaryCellId: cellCopies.primaryCellId })
    .from(cellCopies)
    .where(inArray(cellCopies.observedCellId, [...observedCellIds]));
}

export async function loadCentres(tx: DbTx, observedCellIds: readonly number[]): Promise<Map<number, PlacedCell>> {
  if (observedCellIds.length === 0) return new Map();

  const copies = await findCopiesOf(tx, observedCellIds);
  const primaryOf = new Map(copies.map((copy) => [copy.observedCellId, copy.primaryCellId]));
  const placed = await loadServingCentres(tx, inArray(observedCells.id, unique([...observedCellIds, ...primaryOf.values()])));
  const centreOf = new Map(placed.map((cell) => [cell.observedCellId, cell]));
  return new Map(
    observedCellIds.flatMap((id) => {
      const centre = centreOf.get(primaryOf.get(id) ?? id);
      return centre === undefined ? [] : [[id, centre] as const];
    }),
  );
}

export async function findStationsOfCells(tx: DbTx, observedCellIds: readonly number[]): Promise<Map<number, number>> {
  const matched = await tx
    .select({ observedCellId: cellMatches.observedCellId, matchedStationId: cellMatches.stationId, cellStationId: cells.station_id })
    .from(cellMatches)
    .leftJoin(cells, eq(cells.id, cellMatches.cellId))
    .where(inArray(cellMatches.observedCellId, [...observedCellIds]));
  return new Map(
    matched.flatMap(({ observedCellId, matchedStationId, cellStationId }) => {
      const stationId = matchedStationId ?? cellStationId;
      return stationId === null ? [] : [[observedCellId, stationId] as const];
    }),
  );
}

function weightedCentre(placed: readonly PlacedCell[]): Point | null {
  const weight = placed.reduce((sum, cell) => sum + cell.weight, 0);
  if (weight === 0) return null;
  return {
    latitude: placed.reduce((sum, cell) => sum + cell.latitude * cell.weight, 0) / weight,
    longitude: placed.reduce((sum, cell) => sum + cell.longitude * cell.weight, 0) / weight,
  };
}

export function nearestTo<T extends { point: Point | null }>(from: Point | undefined, candidates: readonly T[]): T | undefined {
  if (from === undefined) return undefined;
  const [nearest] = candidates
    .flatMap((candidate) => (candidate.point === null ? [] : [{ candidate, distanceM: metersBetween(from, candidate.point) }]))
    .toSorted((a, b) => a.distanceM - b.distanceM);
  return nearest?.candidate;
}

export function addToNearestPart(
  parts: readonly LockedCell[][],
  others: readonly LockedCell[],
  centres: ReadonlyMap<number, PlacedCell>,
): LockedCell[][] {
  const placed = parts.map((members) => ({ members: [...members], point: weightedCentre(members.flatMap((cell) => centres.get(cell.id) ?? [])) }));
  const [largest] = placed.toSorted((a, b) => b.members.length - a.members.length);
  for (const cell of others) (nearestTo(centres.get(cell.id), placed) ?? largest)?.members.push(cell);
  return placed.map((part) => part.members);
}

async function findLastPlaces(tx: DbTx, sites: readonly NodeSite[]): Promise<Map<string, number>> {
  const lastPlaces = await tx
    .select({ plmn: observedSites.plmn, rat: observedSites.rat, nodeId: observedSites.nodeId, place: max(observedSites.place) })
    .from(observedSites)
    .where(and(isOfNodes(sites), gt(observedSites.place, 0)))
    .groupBy(observedSites.plmn, observedSites.rat, observedSites.nodeId);
  return new Map(lastPlaces.map(({ place, ...node }) => [nodeKey(node), place ?? 0]));
}

async function chooseLinkedPart(tx: DbTx, stationId: number, parts: readonly PlacedPart[]): Promise<number | undefined> {
  const memberIds = parts.flatMap((part) => part.members.map((cell) => cell.id));
  const stationOfCell = await findStationsOfCells(tx, memberIds);
  const cellsAtStation = (part: PlacedPart) => part.members.filter((cell) => stationOfCell.get(cell.id) === stationId).length;
  const [mostAtStation] = parts.toSorted((a, b) => cellsAtStation(b) - cellsAtStation(a));
  if (mostAtStation !== undefined && cellsAtStation(mostAtStation) > 0) return mostAtStation.siteId;

  const [station] = await tx
    .select({ latitude: locations.latitude, longitude: locations.longitude })
    .from(stations)
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .where(eq(stations.id, stationId));
  const centres = await loadCentres(tx, memberIds);
  const placed = parts.map((part) => ({ part, point: weightedCentre(part.members.flatMap((cell) => centres.get(cell.id) ?? [])) }));
  const [largest] = parts.toSorted((a, b) => b.members.length - a.members.length);
  return (nearestTo(station, placed)?.part ?? largest)?.siteId;
}

async function planCopySplits(tx: DbTx, parts: readonly PlacedPart[]): Promise<SplitPlan[]> {
  const partOfPrimary = new Map(parts.flatMap(({ siteId, members }) => members.map((cell) => [cell.id, siteId] as const)));
  if (partOfPrimary.size === 0) return [];

  const copies = await tx
    .select({ site: NODE_SITE_COLUMNS, observedCellId: cellCopies.observedCellId, primaryCellId: cellCopies.primaryCellId })
    .from(cellCopies)
    .innerJoin(observedCells, eq(observedCells.id, cellCopies.observedCellId))
    .innerJoin(observedSites, eq(observedSites.id, observedCells.observedSiteId))
    .where(and(inArray(cellCopies.primaryCellId, [...partOfPrimary.keys()]), isLiveNodeSite));
  const partOfCopy = new Map(
    copies.flatMap((copy) => {
      const partSiteId = partOfPrimary.get(copy.primaryCellId);
      return partSiteId === undefined ? [] : [[copy.observedCellId, partSiteId] as const];
    }),
  );
  const spanningSites = [...Map.groupBy(copies, (copy) => copy.site.id).values()].flatMap((rows) => {
    const [first] = rows;
    return first !== undefined && new Set(rows.map((row) => partOfCopy.get(row.observedCellId))).size > 1 ? [first.site] : [];
  });
  if (spanningSites.length === 0) return [];

  const locked = await lockCellsOfSites(
    tx,
    spanningSites.map((site) => site.id),
  );
  const others = locked.filter((cell) => !partOfCopy.has(cell.id));
  const centres =
    others.length === 0
      ? new Map<number, PlacedCell>()
      : await loadCentres(
          tx,
          locked.map((cell) => cell.id),
        );
  const cellsBySite = Map.groupBy(locked, (cell) => cell.observedSiteId);
  return spanningSites.flatMap((site): SplitPlan[] => {
    const onSite = cellsBySite.get(site.id) ?? [];
    const copyParts = [...Map.groupBy(onSite, (cell) => partOfCopy.get(cell.id))]
      .flatMap(([partSiteId, members]) => (partSiteId === undefined ? [] : [[partSiteId, members] as const]))
      .toSorted(([a], [b]) => a - b)
      .map(([, members]) => members);
    const unmirrored = onSite.filter((cell) => !partOfCopy.has(cell.id));
    return copyParts.length < 2 ? [] : [{ site, parts: addToNearestPart(copyParts, unmirrored, centres) }];
  });
}

export async function splitSites(tx: DbTx, plans: readonly SplitPlan[]): Promise<number[]> {
  if (plans.length === 0) return [];

  const lastPlaces = await findLastPlaces(
    tx,
    plans.map((plan) => plan.site),
  );
  const parts = plans.flatMap(({ site, parts: planned }) =>
    planned.map((members) => {
      const place = (lastPlaces.get(nodeKey(site)) ?? site.place) + 1;
      lastPlaces.set(nodeKey(site), place);
      return { members, identity: { plmn: site.plmn, rat: site.rat, nodeId: site.nodeId, place } };
    }),
  );
  const created = await tx
    .insert(observedSites)
    .values(parts.map((part) => part.identity))
    .returning(NODE_SITE_COLUMNS);
  const siteIdOf = new Map(created.map((site) => [placeKey(site), site.id]));
  const placedParts = parts.map(({ members, identity }): PlacedPart => {
    const siteId = siteIdOf.get(placeKey(identity));
    if (siteId === undefined) throw new Error(`Place ${identity.place} of the node ${nodeKey(identity)} was not created`);
    return { siteId, members };
  });
  const moves = placedParts.flatMap(({ siteId, members }): CellMove[] => members.map((cell) => ({ cell, siteId })));

  const retiredIds = plans.map((plan) => plan.site.id);
  const partIds = created.map((site) => site.id);
  await moveCells(tx, moves);
  await tx
    .update(observedSites)
    .set({ retiredAt: sql`now()` })
    .where(inArray(observedSites.id, retiredIds));
  await recordReplacements(tx, moves, new Set(retiredIds), async (stationId, successorIds) => {
    const heir = await chooseLinkedPart(
      tx,
      stationId,
      placedParts.filter((part) => successorIds.includes(part.siteId)),
    );
    return heir === undefined ? [] : [heir];
  });
  await linkSites(tx, partIds);
  await markSitesDirty(tx, [...retiredIds, ...partIds]);
  const copySplitIds = await splitSites(tx, await planCopySplits(tx, placedParts));
  return [...retiredIds, ...partIds, ...copySplitIds];
}
