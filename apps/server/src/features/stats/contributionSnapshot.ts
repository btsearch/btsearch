import { cells, contributionSnapshots, extraIdentificators, lteCells, nrCells, stationSectors } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { count, eq, isNotNull, sql } from "drizzle-orm";

import { logger } from "../../utils/logger.ts";
import { stationCountries } from "../stations/country.ts";

type CountryCount = { countryCode: string | null; value: number };

const perCountry = { countryCode: stationCountries.countryCode, value: count() };

function countsByCountry(rows: readonly CountryCount[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.countryCode !== null) counts.set(row.countryCode, row.value);
  }
  return counts;
}

export async function takeContributionSnapshot(): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [stationRows, sectorRows, extraIdRows, cellRows, ltePciRows, nrPciRows] = await Promise.all([
    db.select(perCountry).from(stationCountries.table).groupBy(stationCountries.countryCode),
    db
      .select(perCountry)
      .from(stationSectors)
      .innerJoin(stationCountries.table, eq(stationSectors.station_id, stationCountries.stationId))
      .groupBy(stationCountries.countryCode),
    db
      .select(perCountry)
      .from(extraIdentificators)
      .innerJoin(stationCountries.table, eq(extraIdentificators.station_id, stationCountries.stationId))
      .groupBy(stationCountries.countryCode),
    db
      .select(perCountry)
      .from(cells)
      .innerJoin(stationCountries.table, eq(cells.station_id, stationCountries.stationId))
      .groupBy(stationCountries.countryCode),
    db
      .select(perCountry)
      .from(lteCells)
      .innerJoin(cells, eq(cells.id, lteCells.cell_id))
      .innerJoin(stationCountries.table, eq(cells.station_id, stationCountries.stationId))
      .where(isNotNull(lteCells.pci))
      .groupBy(stationCountries.countryCode),
    db
      .select(perCountry)
      .from(nrCells)
      .innerJoin(cells, eq(cells.id, nrCells.cell_id))
      .innerJoin(stationCountries.table, eq(cells.station_id, stationCountries.stationId))
      .where(isNotNull(nrCells.pci))
      .groupBy(stationCountries.countryCode),
  ]);

  const stations = countsByCountry(stationRows);
  const sectors = countsByCountry(sectorRows);
  const extraIds = countsByCountry(extraIdRows);
  const cellCounts = countsByCountry(cellRows);
  const ltePciCells = countsByCountry(ltePciRows);
  const nrPciCells = countsByCountry(nrPciRows);
  if (stations.size === 0) return;

  await db
    .insert(contributionSnapshots)
    .values(
      [...stations].map(([countryCode, totalStations]) => ({
        snapshot_date: today,
        countryCode,
        totalStations,
        totalSectors: sectors.get(countryCode) ?? 0,
        totalExtraIds: extraIds.get(countryCode) ?? 0,
        totalCells: cellCounts.get(countryCode) ?? 0,
        totalCellsWithPCI: (ltePciCells.get(countryCode) ?? 0) + (nrPciCells.get(countryCode) ?? 0),
      })),
    )
    .onConflictDoUpdate({
      target: [contributionSnapshots.snapshot_date, contributionSnapshots.countryCode],
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
