import { cellMatches, cells, locations, observedCells, observedSites, stations } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { logger } from "../../../../utils/logger.js";
import { DEFAULT_STATION_STATUSES } from "../../../stations/status.js";
import type { LockedCell } from "../../cells/locks.js";
import type { PlacedCell } from "../../cells/servingCentres.js";
import { metersBetween } from "../../flags/sites/flaggedSite.js";
import type { Point } from "../../tiles/squares.js";
import { linkSites } from "../links.js";
import { type CellMove, markSitesDirty, moveCells } from "../moves.js";
import { NODE_SITE_COLUMNS, type NodeSite, findPlacesOfNodes, isLiveNodeSite, nodeKey } from "../nodes.js";
import { type SplitPlan, addToNearestPart, loadCentres, lockCellsOfSites, splitSites } from "./parts.js";

const STATIONS_OF_ONE_PLACE_WITHIN_M = 500;

type CellAtStationRow = Awaited<ReturnType<typeof findCellsAtStations>>[number];
type PlacesOfNode = { placeOfCell: Map<number, number>; ownerOfPlace: Map<number, number> };
type PlacesOfSite = PlacesOfNode & { site: NodeSite; stayingPlaces: number[] };

export function findCellsAtStations(tx: DbTx, siteIds: readonly number[]) {
  return tx
    .select({
      site: NODE_SITE_COLUMNS,
      observedCellId: observedCells.id,
      stationId: stations.id,
      latitude: locations.latitude,
      longitude: locations.longitude,
    })
    .from(cellMatches)
    .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
    .innerJoin(observedSites, and(eq(observedSites.id, observedCells.observedSiteId), eq(observedSites.rat, observedCells.rat)))
    .innerJoin(cells, eq(cells.id, cellMatches.cellId))
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .where(and(inArray(observedCells.observedSiteId, [...siteIds]), isLiveNodeSite, inArray(stations.status, DEFAULT_STATION_STATUSES)));
}

function placeOfStations(points: ReadonlyMap<number, Point>): Map<number, number> {
  const inOrder = [...points].toSorted(([a], [b]) => a - b);
  const placeOf = new Map<number, number>();
  for (const [index, [stationId, point]] of inOrder.entries()) {
    const joined = new Set(
      inOrder
        .slice(0, index)
        .flatMap(([otherId, other]) => (metersBetween(point, other) <= STATIONS_OF_ONE_PLACE_WITHIN_M ? (placeOf.get(otherId) ?? []) : [])),
    );
    const place = Math.min(stationId, ...joined);
    for (const [otherId, otherPlace] of placeOf) if (joined.has(otherPlace)) placeOf.set(otherId, place);
    placeOf.set(stationId, place);
  }
  return placeOf;
}

export function placeOfCells(atStations: readonly CellAtStationRow[]): Map<number, number> {
  const placeOf = placeOfStations(new Map(atStations.map(({ stationId, latitude, longitude }) => [stationId, { latitude, longitude }])));
  return new Map(
    atStations.flatMap(({ observedCellId, stationId }) => {
      const place = placeOf.get(stationId);
      return place === undefined ? [] : [[observedCellId, place] as const];
    }),
  );
}

function findPlacesOfNode(
  holders: readonly NodeSite[],
  spanningIds: ReadonlySet<number>,
  rowsOfSite: ReadonlyMap<number, CellAtStationRow[]>,
): PlacesOfNode {
  const placeOfCell = placeOfCells(holders.flatMap((holder) => rowsOfSite.get(holder.id) ?? []));
  const ownerOfPlace = new Map<number, number>();
  const keepersFirst = holders.toSorted((a, b) => Number(spanningIds.has(a.id)) - Number(spanningIds.has(b.id)) || a.place - b.place);
  for (const holder of keepersFirst) {
    for (const row of rowsOfSite.get(holder.id) ?? []) {
      const place = placeOfCell.get(row.observedCellId);
      if (place !== undefined && !ownerOfPlace.has(place)) ownerOfPlace.set(place, holder.id);
    }
  }
  return { placeOfCell, ownerOfPlace };
}

function findPlacesOfSite(site: NodeSite, placesOfNode: PlacesOfNode, rows: readonly CellAtStationRow[]): PlacesOfSite {
  const { placeOfCell, ownerOfPlace } = placesOfNode;
  const placesOfCells = rows.flatMap((row) => placeOfCell.get(row.observedCellId) ?? []);
  const sizes = [...Map.groupBy(placesOfCells, (place) => place)].map(([place, cellsAt]) => ({ place, size: cellsAt.length }));
  const owned = sizes.filter(({ place }) => ownerOfPlace.get(place) === site.id).map(({ place }) => place);
  const [largest] = sizes.toSorted((a, b) => b.size - a.size || a.place - b.place);
  const stayingPlaces = owned.length > 0 || largest === undefined ? owned : [largest.place];
  return { ...placesOfNode, site, stayingPlaces };
}

export async function splitSitesByStations(tx: DbTx, siteIds: readonly number[]): Promise<number[]> {
  if (siteIds.length === 0) return [];

  const atStations = await findCellsAtStations(tx, siteIds);
  const spanning = [...Map.groupBy(atStations, (row) => row.site.id).values()].flatMap((rows) => {
    const [first] = rows;
    return first !== undefined && new Set(placeOfCells(rows).values()).size > 1 ? [first.site] : [];
  });
  if (spanning.length === 0) return [];

  const placesOf = await findPlacesOfNodes(tx, spanning);
  const holdersOfNode = [...Map.groupBy(spanning, nodeKey)].map(([key, sites]) => {
    const holders = new Map([...sites, ...(placesOf.get(key) ?? [])].map((holder) => [holder.id, holder]));
    return { sites, holders: [...holders.values()] };
  });
  const requested = new Set(siteIds);
  const siblingIds = holdersOfNode.flatMap(({ holders }) => holders.map((holder) => holder.id)).filter((id) => !requested.has(id));
  const siblingRows = siblingIds.length === 0 ? [] : await findCellsAtStations(tx, siblingIds);
  const rowsOfSite = Map.groupBy([...atStations, ...siblingRows], (row) => row.site.id);
  const spanningIds = new Set(spanning.map((site) => site.id));
  const candidates = holdersOfNode.flatMap(({ sites, holders }) => {
    const placesOfNode = findPlacesOfNode(holders, spanningIds, rowsOfSite);
    return sites.map((site) => findPlacesOfSite(site, placesOfNode, rowsOfSite.get(site.id) ?? []));
  });

  const locked = await lockCellsOfSites(
    tx,
    candidates.map(({ site }) => site.id),
  );
  const cellsBySite = Map.groupBy(locked, (cell) => cell.observedSiteId);
  const moves = candidates.flatMap(({ site, placeOfCell, ownerOfPlace, stayingPlaces }) =>
    (cellsBySite.get(site.id) ?? []).flatMap((cell): CellMove[] => {
      const place = placeOfCell.get(cell.id);
      const ownerId = place === undefined || stayingPlaces.includes(place) ? undefined : ownerOfPlace.get(place);
      return ownerId === undefined ? [] : [{ cell, siteId: ownerId }];
    }),
  );

  const leaving = new Set(moves.map(({ cell }) => cell.id));
  const arriving = Map.groupBy(moves, (move) => move.siteId);
  const splittable = candidates.flatMap(({ site, placeOfCell }) => {
    const onSite = [
      ...(cellsBySite.get(site.id) ?? []).filter((cell) => !leaving.has(cell.id)),
      ...(arriving.get(site.id) ?? []).map(({ cell }): LockedCell => ({ ...cell, observedSiteId: site.id })),
    ];
    const parts = [...Map.groupBy(onSite, (cell) => placeOfCell.get(cell.id))].flatMap(([place, members]) => (place === undefined ? [] : [members]));
    const others = onSite.filter((cell) => !placeOfCell.has(cell.id));
    return parts.length < 2 ? [] : [{ site, parts, others }];
  });
  const needsCentres = splittable.some(({ others }) => others.length > 0);
  const centres = needsCentres
    ? await loadCentres(
        tx,
        splittable.flatMap(({ parts, others }) => [...parts.flat(), ...others].map((cell) => cell.id)),
      )
    : new Map<number, PlacedCell>();
  const plans = splittable.map(({ site, parts, others }): SplitPlan => ({ site, parts: addToNearestPart(parts, others, centres) }));

  await moveCells(tx, moves);
  const splitIds = new Set(plans.map((plan) => plan.site.id));
  const movedBetween = unique(moves.flatMap(({ cell, siteId }) => [cell.observedSiteId, siteId])).filter((id) => !splitIds.has(id));
  await linkSites(tx, movedBetween);
  await markSitesDirty(tx, movedBetween);
  const changedSiteIds = await splitSites(tx, plans);
  if (moves.length > 0) logger.info("observations.sites.cells_moved_to_their_place", { cells: moves.length });
  if (plans.length > 0) logger.info("observations.sites.split_by_stations", { sites: plans.length });
  return [...movedBetween, ...changedSiteIds];
}
