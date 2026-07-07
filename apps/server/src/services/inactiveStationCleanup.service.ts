import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { inArray } from "drizzle-orm";

import db from "../database/psql.js";
import { deleteLocationWithPhotos } from "../utils/location.helpers.js";
import { logger } from "../utils/logger.js";

const INACTIVE_GRACE_MONTHS = 6;
const CLEANUP_LIMIT = 100;

function getInactiveCutoff(date = new Date()): Date {
  const cutoff = new Date(date);
  cutoff.setMonth(cutoff.getMonth() - INACTIVE_GRACE_MONTHS);
  return cutoff;
}

export async function cleanupExpiredInactiveStations(): Promise<void> {
  const cutoff = getInactiveCutoff();
  const candidates = await db.query.stations.findMany({
    where: {
      AND: [{ status: "inactive" }, { statusChangedAt: { lte: cutoff } }, { updatedAt: { lte: cutoff } }],
    },
    columns: { id: true, location_id: true },
    limit: CLEANUP_LIMIT,
  });

  if (candidates.length === 0) return;

  const stationIds = candidates.map((station) => station.id);
  const locationIds = [...new Set(candidates.map((station) => station.location_id).filter((id): id is number => id !== null))];

  await db.transaction(async (tx) => {
    const stationCells = await tx.query.cells.findMany({
      where: { station_id: { in: stationIds } },
      columns: { id: true, rat: true },
    });
    const cellIds = stationCells.map((cell) => cell.id);

    if (cellIds.length > 0) {
      const gsmIds = stationCells.filter((cell) => cell.rat === "GSM").map((cell) => cell.id);
      const umtsIds = stationCells.filter((cell) => cell.rat === "UMTS").map((cell) => cell.id);
      const lteIds = stationCells.filter((cell) => cell.rat === "LTE").map((cell) => cell.id);
      const nrIds = stationCells.filter((cell) => cell.rat === "NR").map((cell) => cell.id);

      if (gsmIds.length > 0) await tx.delete(gsmCells).where(inArray(gsmCells.cell_id, gsmIds));
      if (umtsIds.length > 0) await tx.delete(umtsCells).where(inArray(umtsCells.cell_id, umtsIds));
      if (lteIds.length > 0) await tx.delete(lteCells).where(inArray(lteCells.cell_id, lteIds));
      if (nrIds.length > 0) await tx.delete(nrCells).where(inArray(nrCells.cell_id, nrIds));

      await tx.delete(cells).where(inArray(cells.id, cellIds));
    }

    await tx.delete(stations).where(inArray(stations.id, stationIds));

    const remainingLocations = await tx.query.stations.findMany({
      where: { location_id: { in: locationIds } },
      columns: { location_id: true },
    });
    const remainingLocationIds = new Set(remainingLocations.map((station) => station.location_id).filter((id): id is number => id !== null));
    const emptyLocationIds = locationIds.filter((locationId) => !remainingLocationIds.has(locationId));
    await Promise.all(emptyLocationIds.map((locationId) => deleteLocationWithPhotos(tx, locationId)));
  });

  logger.info("inactive_stations_cleanup_finished", { deleted: stationIds.length, cutoff: cutoff.toISOString() });
}
