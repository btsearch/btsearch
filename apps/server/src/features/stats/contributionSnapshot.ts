import { cells, contributionSnapshots, extraIdentificators, lteCells, nrCells, stationSectors, stations } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { count, isNotNull, sql } from "drizzle-orm";

import { logger } from "../../utils/logger.ts";

export async function takeContributionSnapshot(): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [stationsCount, sectorsCount, extraIdsCount, cellsCounts, ltePCICells, nrPCICells] = await Promise.all([
    db.select({ count: count() }).from(stations),
    db.select({ count: count() }).from(stationSectors),
    db.select({ count: count() }).from(extraIdentificators),
    db.select({ count: count() }).from(cells),
    db.select({ count: count() }).from(lteCells).where(isNotNull(lteCells.pci)),
    db.select({ count: count() }).from(nrCells).where(isNotNull(nrCells.pci)),
  ]);

  await db
    .insert(contributionSnapshots)
    .values({
      snapshot_date: today,
      totalStations: stationsCount[0]?.count ?? 0,
      totalSectors: sectorsCount[0]?.count ?? 0,
      totalExtraIds: extraIdsCount[0]?.count ?? 0,
      totalCells: cellsCounts[0]?.count ?? 0,
      totalCellsWithPCI: (ltePCICells[0]?.count ?? 0) + (nrPCICells[0]?.count ?? 0),
    })
    .onConflictDoUpdate({
      target: contributionSnapshots.snapshot_date,
      set: {
        totalStations: sql`excluded.total_stations`,
        totalSectors: sql`excluded.total_sectors`,
        totalExtraIds: sql`excluded.total_extra_ids`,
        totalCells: sql`excluded.total_cells`,
        totalCellsWithPCI: sql`excluded.total_cells_with_pci`,
      },
    });

  logger.info(`Contribution snapshot saved for ${today.toISOString()}`);
}
