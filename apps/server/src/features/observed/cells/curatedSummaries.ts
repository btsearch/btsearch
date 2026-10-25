import { cellMatches, curatedCellSummaries, observedCellSummaries, observedCellValues, observedCells } from "@openbts/drizzle";
import { and, count, eq, inArray, max, min } from "drizzle-orm";

import type { DbTx } from "../../../types/global.js";
import { latestConfirmedValue } from "../flags/cells/sightings.js";

async function findConfirmedBandwidths(tx: DbTx, cellIds: readonly number[]): Promise<Map<number, number>> {
  const matched = await tx
    .select({ cellId: cellMatches.cellId, observedCellId: cellMatches.observedCellId, observedSiteId: observedCells.observedSiteId })
    .from(cellMatches)
    .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
    .where(inArray(cellMatches.cellId, [...cellIds]));
  if (matched.length === 0) return new Map();

  const observedCellIds = matched.map((match) => match.observedCellId);
  const values = await tx
    .select({
      observedCellId: observedCellValues.observedCellId,
      value: observedCellValues.value,
      sampleCount: observedCellValues.sampleCount,
      contributorBits: observedCellValues.contributorBits,
      lastSeenOn: observedCellValues.lastSeenOn,
    })
    .from(observedCellValues)
    .where(and(inArray(observedCellValues.observedCellId, observedCellIds), eq(observedCellValues.field, "bandwidth")));
  const matchOf = new Map(matched.map((match) => [match.observedCellId, match]));
  const sightings = values.flatMap((row) => {
    const match = matchOf.get(row.observedCellId);
    if (match === undefined || match.cellId === null) return [];
    return [{ ...row, cellId: match.cellId, observedSiteId: match.observedSiteId }];
  });
  return new Map(
    [...Map.groupBy(sightings, (sighting) => sighting.cellId)].flatMap(([cellId, seen]) => {
      const bandwidthKhz = latestConfirmedValue(seen);
      return bandwidthKhz === null ? [] : [[cellId, bandwidthKhz] as const];
    }),
  );
}

export async function summarizeCuratedCells(tx: DbTx, cellIds: readonly number[]): Promise<void> {
  if (cellIds.length === 0) return;

  const sightings = await tx
    .select({
      cellId: cellMatches.cellId,
      firstSeenOn: min(observedCellSummaries.firstSeenOn),
      lastSeenOn: max(observedCellSummaries.lastSeenOn),
      observedCellCount: count(),
    })
    .from(cellMatches)
    .innerJoin(observedCellSummaries, eq(observedCellSummaries.observedCellId, cellMatches.observedCellId))
    .where(inArray(cellMatches.cellId, [...cellIds]))
    .groupBy(cellMatches.cellId);
  const bandwidths = await findConfirmedBandwidths(tx, cellIds);

  await tx.delete(curatedCellSummaries).where(inArray(curatedCellSummaries.cellId, [...cellIds]));
  const rows = sightings.flatMap(({ cellId, firstSeenOn, lastSeenOn, observedCellCount }) => {
    if (cellId === null || firstSeenOn === null || lastSeenOn === null) return [];
    return [{ cellId, firstSeenOn, lastSeenOn, observedCellCount, bandwidthKhz: bandwidths.get(cellId) ?? null }];
  });
  if (rows.length > 0) await tx.insert(curatedCellSummaries).values(rows);
}
