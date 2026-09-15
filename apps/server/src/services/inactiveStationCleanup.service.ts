import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { inArray } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";

import db from "../database/psql.js";
import { logger } from "../utils/logger.js";
import { loadCellSnapshots, runAuditedOperation, systemAuditContext } from "./audit/index.js";
import { deleteLocationWithPhotos } from "./locations/deleteWithPhotos.js";

const INACTIVE_GRACE_MONTHS = 6;
const CLEANUP_LIMIT = 100;
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

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
    limit: CLEANUP_LIMIT,
  });

  if (candidates.length === 0) return;

  const stationIds = candidates.map((station) => station.id);
  const attachmentUuids = await runAuditedOperation(
    systemAuditContext(),
    { kind: "system.inactive_cleanup", metadata: { cutoff: cutoff.toISOString(), station_ids: stationIds } },
    async (tx, audit) => {
      const stationRows = await tx.query.stations.findMany({ where: { id: { in: stationIds } } });
      const locationIds = [...new Set(stationRows.map((station) => station.location_id).filter((id): id is number => id !== null))];
      const stationCellIds = await tx.query.cells.findMany({
        where: { station_id: { in: stationIds } },
        columns: { id: true },
      });
      const cellSnapshots = await loadCellSnapshots(
        tx,
        stationCellIds.map((cell) => cell.id),
      );
      const stationCells = [...cellSnapshots.values()];
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
      await audit.logMany([
        ...stationCells.map((cell) => ({
          entity: "cells" as const,
          op: "delete" as const,
          recordId: cell.id,
          stationId: cell.station_id,
          old: cell,
        })),
        ...stationRows.map((station) => ({
          entity: "stations" as const,
          op: "delete" as const,
          recordId: station.id,
          stationId: station.id,
          old: station,
        })),
      ]);

      const remainingLocations = await tx.query.stations.findMany({
        where: { location_id: { in: locationIds } },
        columns: { location_id: true },
      });
      const remainingLocationIds = new Set(remainingLocations.map((station) => station.location_id).filter((id): id is number => id !== null));
      const emptyLocationIds = locationIds.filter((locationId) => !remainingLocationIds.has(locationId));
      const deletedAttachmentUuids: string[] = [];
      /* eslint-disable no-await-in-loop */
      for (const locationId of emptyLocationIds) deletedAttachmentUuids.push(...(await deleteLocationWithPhotos(audit, locationId)));
      /* eslint-enable no-await-in-loop */
      return deletedAttachmentUuids;
    },
  );

  await Promise.all(attachmentUuids.map((uuid) => fs.unlink(path.join(UPLOAD_DIR, `${uuid}.webp`)).catch(() => {})));

  logger.info("inactive_stations_cleanup_finished", { deleted: stationIds.length, cutoff: cutoff.toISOString() });
}
