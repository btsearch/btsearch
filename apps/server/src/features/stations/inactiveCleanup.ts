import {
  attachments,
  cells,
  gsmCells,
  lteCells,
  nrCells,
  stationComments,
  stations,
  submissionPhotos,
  submissions,
  umtsCells,
} from "@openbts/drizzle";
import { type SQL, and, eq, inArray, lte } from "drizzle-orm";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";
import { logger } from "../../utils/logger.js";
import { deletePhotoFiles } from "../../utils/photoFiles.js";
import { loadCellSnapshots, runAuditedOperation, systemAuditContext } from "../audit/index.js";
import { deleteLocationWithPhotos } from "../locations/deleteWithPhotos.js";
import { isAttachmentUsedByNoLocation } from "../submissions/cleanup.js";

type CleanedStations = { stationCount: number; attachmentUuids: string[] };

const INACTIVE_GRACE_MONTHS = 6;
const CLEANUP_LIMIT = 100;

function getInactiveCutoff(date = new Date()): Date {
  const cutoff = new Date(date);
  cutoff.setMonth(cutoff.getMonth() - INACTIVE_GRACE_MONTHS);
  return cutoff;
}

function isExpiredInactive(cutoff: Date): SQL | undefined {
  return and(eq(stations.status, "inactive"), lte(stations.statusChangedAt, cutoff), lte(stations.updatedAt, cutoff));
}

async function deleteUnpublishedUploads(tx: DbTx, stationIds: number[]): Promise<string[]> {
  const submissionPhotoAttachmentIds = tx
    .select({ id: submissionPhotos.attachment_id })
    .from(submissionPhotos)
    .innerJoin(submissions, eq(submissions.id, submissionPhotos.submission_id))
    .where(inArray(submissions.station_id, stationIds));
  const comments = await tx
    .select({ images: stationComments.attachments })
    .from(stationComments)
    .where(inArray(stationComments.station_id, stationIds));
  const commentImageUuids = unique(comments.flatMap((comment) => comment.images ?? []).map((image) => image.uuid));

  const submissionPhotoAttachments = await tx
    .delete(attachments)
    .where(and(inArray(attachments.id, submissionPhotoAttachmentIds), isAttachmentUsedByNoLocation(tx)))
    .returning({ uuid: attachments.uuid });
  const commentImageAttachments =
    commentImageUuids.length === 0
      ? []
      : await tx
          .delete(attachments)
          .where(and(inArray(attachments.uuid, commentImageUuids), isAttachmentUsedByNoLocation(tx)))
          .returning({ uuid: attachments.uuid });
  return [...submissionPhotoAttachments, ...commentImageAttachments].map(({ uuid }) => uuid);
}

export async function cleanupExpiredInactiveStations(): Promise<void> {
  const cutoff = getInactiveCutoff();
  const candidates = await db.select({ id: stations.id }).from(stations).where(isExpiredInactive(cutoff)).limit(CLEANUP_LIMIT);

  if (candidates.length === 0) return;

  const candidateIds = candidates.map((station) => station.id);
  const cleaned = await runAuditedOperation(
    systemAuditContext(),
    { kind: "system.inactive_cleanup", metadata: { cutoff: cutoff.toISOString(), station_ids: candidateIds } },
    async (tx, audit): Promise<CleanedStations> => {
      await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(inArray(submissions.station_id, candidateIds))
        .orderBy(submissions.id)
        .for("update");
      const stationRows = await tx
        .select()
        .from(stations)
        .where(and(inArray(stations.id, candidateIds), isExpiredInactive(cutoff)))
        .orderBy(stations.id)
        .for("update");
      const stationIds = stationRows.map((station) => station.id);
      if (stationIds.length === 0) return { stationCount: 0, attachmentUuids: [] };

      const deletedAttachmentUuids = await deleteUnpublishedUploads(tx, stationIds);
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
      /* eslint-disable no-await-in-loop */
      for (const locationId of emptyLocationIds) deletedAttachmentUuids.push(...(await deleteLocationWithPhotos(audit, locationId)));
      /* eslint-enable no-await-in-loop */
      return { stationCount: stationIds.length, attachmentUuids: deletedAttachmentUuids };
    },
  );

  await deletePhotoFiles(cleaned.attachmentUuids);

  logger.info("inactive_stations_cleanup_finished", { deleted: cleaned.stationCount, cutoff: cutoff.toISOString() });
}
