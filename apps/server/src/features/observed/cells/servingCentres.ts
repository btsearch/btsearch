import { cellBins, cellCopies, observedCells } from "@openbts/drizzle";
import { type SQL, and, eq, gt, isNull } from "drizzle-orm";

import type { DbTx } from "../../../types/global.js";
import { squareCenter } from "../tiles/squares.js";

export type PlacedCell = { observedCellId: number; latitude: number; longitude: number; weight: number };

export async function loadServingCentres(tx: DbTx, whichCells: SQL): Promise<(PlacedCell & { siteId: number | null })[]> {
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
    .where(and(whichCells, isNull(cellCopies.observedCellId), gt(cellBins.servingWeightMilli, 0n)));

  return [...Map.groupBy(rows, (row) => row.observedCellId)].flatMap(([observedCellId, bins]) => {
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
    if (first === undefined || weight === 0) return [];
    return [{ siteId: first.observedSiteId, observedCellId, latitude: latitude / weight, longitude: longitude / weight, weight }];
  });
}
