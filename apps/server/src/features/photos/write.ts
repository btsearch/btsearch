import { attachments, locationPhotos, stationPhotoSelections } from "@openbts/drizzle";
import { and, eq } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import { type AuditRecorder, loadPhotoSelectionSnapshots, logPhotoSelectionChanges } from "../audit/index.js";

export async function removeLocationPhoto(tx: DbTx, audit: AuditRecorder, locationId: number, locationPhotoId: number): Promise<string | null> {
  const photo = await tx.query.locationPhotos.findFirst({ where: { id: locationPhotoId, location_id: locationId } });
  if (!photo) throw new ErrorResponse("NOT_FOUND");

  const [attachment, affectedSelections, affectedPhotos] = await Promise.all([
    tx.query.attachments.findFirst({ where: { id: photo.attachment_id } }),
    tx
      .select({ station_id: stationPhotoSelections.station_id })
      .from(stationPhotoSelections)
      .innerJoin(locationPhotos, eq(stationPhotoSelections.location_photo_id, locationPhotos.id))
      .where(eq(locationPhotos.attachment_id, photo.attachment_id)),
    tx.query.locationPhotos.findMany({ where: { attachment_id: photo.attachment_id } }),
  ]);
  const affectedStationIds = [...new Set(affectedSelections.map((selection) => selection.station_id))];
  const previousSelections = await loadPhotoSelectionSnapshots(tx, affectedStationIds);

  await tx.delete(locationPhotos).where(and(eq(locationPhotos.id, locationPhotoId), eq(locationPhotos.location_id, locationId)));
  if (attachment) await tx.delete(attachments).where(eq(attachments.id, attachment.id));

  await audit.logMany(
    affectedPhotos.map((deletedPhoto) => ({
      entity: "location_photos",
      op: "delete",
      recordId: deletedPhoto.id,
      old: deletedPhoto,
      metadata: { location_id: deletedPhoto.location_id },
    })),
  );
  await logPhotoSelectionChanges(audit, previousSelections);
  return attachment?.uuid ?? null;
}

export async function replaceStationPhotoSelections(
  tx: DbTx,
  audit: AuditRecorder,
  stationId: number,
  selected: readonly number[],
  mainId: number | null,
): Promise<void> {
  const previousSelections = await loadPhotoSelectionSnapshots(tx, [stationId]);
  await tx.delete(stationPhotoSelections).where(eq(stationPhotoSelections.station_id, stationId));

  if (selected.length > 0) {
    const selectedMainId = mainId !== null && selected.includes(mainId) ? mainId : null;

    await tx.insert(stationPhotoSelections).values(
      selected.map((location_photo_id) => ({
        station_id: stationId,
        location_photo_id,
        is_main: location_photo_id === selectedMainId,
      })),
    );
  }

  await logPhotoSelectionChanges(audit, previousSelections);
}
