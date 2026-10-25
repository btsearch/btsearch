import { cellBins, cellCopies, observedCells } from "@openbts/drizzle";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";

import type { DbTx } from "../../../../types/global.js";
import type { ObservedSiteRecord } from "../../sites/read.js";
import { squareCenter } from "../../tiles/squares.js";
import type { RaisedFlag } from "../kinds.js";
import { observedSiteSubject } from "../subjects.js";
import { isFlagSubject, metersBetween, siteMeasureOf, toMillionths, whereShown } from "./flaggedSite.js";

const PLACE_WITHIN_M = 3000;

export type PlacedCell = { observedCellId: number; latitude: number; longitude: number; weight: number };

function clusterPlaces(cells: readonly PlacedCell[]): { latitude: number; longitude: number; observedCellIds: number[] }[] {
  const places: { latitude: number; longitude: number; weight: number; observedCellIds: number[] }[] = [];
  for (const cell of cells.toSorted((a, b) => b.weight - a.weight || a.observedCellId - b.observedCellId)) {
    const place = places.find((candidate) => metersBetween(candidate, cell) <= PLACE_WITHIN_M);
    if (place === undefined) {
      places.push({ latitude: cell.latitude, longitude: cell.longitude, weight: cell.weight, observedCellIds: [cell.observedCellId] });
      continue;
    }
    const weight = place.weight + cell.weight;
    place.latitude = (place.latitude * place.weight + cell.latitude * cell.weight) / weight;
    place.longitude = (place.longitude * place.weight + cell.longitude * cell.weight) / weight;
    place.weight = weight;
    place.observedCellIds.push(cell.observedCellId);
  }
  return places.map(({ latitude, longitude, observedCellIds }) => ({
    latitude: toMillionths(latitude),
    longitude: toMillionths(longitude),
    observedCellIds: observedCellIds.toSorted((a, b) => a - b),
  }));
}

export function raiseNodeSpansPlacesFlag(site: ObservedSiteRecord, cells: readonly PlacedCell[]): RaisedFlag<"nodeSpansPlaces"> | null {
  if (!isFlagSubject(site) || !site.isConfirmed || site.estimate === null || site.estimate.isConsistent || cells.length === 0) return null;
  return {
    kind: "nodeSpansPlaces",
    subjectKey: observedSiteSubject(site),
    refs: whereShown(site),
    evidence: { places: clusterPlaces(cells) },
    suggestion: null,
    measure: siteMeasureOf(site, site.estimate),
  };
}

export async function loadPlacedCells(tx: DbTx, siteIds: readonly number[]): Promise<Map<number, PlacedCell[]>> {
  if (siteIds.length === 0) return new Map();

  const rows = await tx
    .select({
      observedSiteId: observedCells.observedSiteId,
      observedCellId: cellBins.observedCellId,
      bin: cellBins.bin,
      weight: cellBins.servingWeightMilli,
    })
    .from(cellBins)
    .innerJoin(observedCells, eq(observedCells.id, cellBins.observedCellId))
    .leftJoin(cellCopies, eq(cellCopies.observedCellId, cellBins.observedCellId))
    .where(and(inArray(observedCells.observedSiteId, [...siteIds]), isNull(cellCopies.observedCellId), gt(cellBins.servingWeightMilli, 0n)));

  const placed = [...Map.groupBy(rows, (row) => row.observedCellId)].flatMap(([observedCellId, bins]): (PlacedCell & { siteId: number })[] => {
    const [first] = bins;
    let latitude = 0;
    let longitude = 0;
    let weight = 0;
    for (const bin of bins) {
      const center = squareCenter(bin.bin);
      const binWeight = Number(bin.weight);
      latitude += center.latitude * binWeight;
      longitude += center.longitude * binWeight;
      weight += binWeight;
    }
    if (first === undefined || first.observedSiteId === null || weight === 0) return [];
    return [{ siteId: first.observedSiteId, observedCellId, latitude: latitude / weight, longitude: longitude / weight, weight }];
  });
  return Map.groupBy(placed, (cell) => cell.siteId);
}
