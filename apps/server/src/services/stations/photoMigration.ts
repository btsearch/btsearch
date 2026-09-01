import { locationPhotos, stationPhotoSelections } from "@openbts/drizzle";
import { and, eq, inArray, ne } from "drizzle-orm";

import type { Database } from "../../database/psql.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type StationPhotoExecutor = Database | Transaction;

export async function migrateStationPhotosToLocation(
  executor: StationPhotoExecutor,
  stationId: number,
  oldLocationId: number,
  newLocationId: number,
  oldLocationOrphaned: boolean,
): Promise<Map<number, number>> {
  const migratedPhotoIds = new Map<number, number>();

  const selections = await executor.query.stationPhotoSelections.findMany({
    where: { station_id: stationId },
    with: { locationPhoto: true },
  });
  const movableSelections = selections.filter((selection) => selection.locationPhoto.location_id !== newLocationId);

  const movablePhotoIds = new Set(movableSelections.map((selection) => selection.location_photo_id));
  const unselectedOldPhotos = oldLocationOrphaned
    ? (await executor.query.locationPhotos.findMany({ where: { location_id: oldLocationId } })).filter((photo) => !movablePhotoIds.has(photo.id))
    : [];

  if (movableSelections.length === 0 && unselectedOldPhotos.length === 0) return migratedPhotoIds;

  const sharedRows =
    !oldLocationOrphaned && movablePhotoIds.size > 0
      ? await executor
          .select({ location_photo_id: stationPhotoSelections.location_photo_id })
          .from(stationPhotoSelections)
          .where(and(inArray(stationPhotoSelections.location_photo_id, [...movablePhotoIds]), ne(stationPhotoSelections.station_id, stationId)))
      : [];
  const sharedPhotoIds = new Set(sharedRows.map((row) => row.location_photo_id));

  const attachmentIds = [
    ...movableSelections.map((selection) => selection.locationPhoto.attachment_id),
    ...unselectedOldPhotos.map((photo) => photo.attachment_id),
  ];
  const existingAtTarget = await executor
    .select({ id: locationPhotos.id, attachment_id: locationPhotos.attachment_id })
    .from(locationPhotos)
    .where(and(eq(locationPhotos.location_id, newLocationId), inArray(locationPhotos.attachment_id, attachmentIds)));
  const targetPhotoIdByAttachment = new Map(existingAtTarget.map((row) => [row.attachment_id, row.id]));

  const photoIdsToMove: number[] = [];
  const photoIdsToDelete: number[] = [];

  const repointSelection = async (selection: (typeof movableSelections)[number], targetPhotoId: number) => {
    await executor
      .insert(stationPhotoSelections)
      .values({ station_id: stationId, location_photo_id: targetPhotoId, is_main: selection.is_main })
      .onConflictDoNothing();
    await executor
      .delete(stationPhotoSelections)
      .where(and(eq(stationPhotoSelections.station_id, stationId), eq(stationPhotoSelections.location_photo_id, selection.location_photo_id)));
    migratedPhotoIds.set(selection.location_photo_id, targetPhotoId);
  };

  /* eslint-disable no-await-in-loop */
  for (const selection of movableSelections) {
    const photo = selection.locationPhoto;
    const existingTargetId = targetPhotoIdByAttachment.get(photo.attachment_id);

    if (existingTargetId !== undefined) {
      await repointSelection(selection, existingTargetId);
      if (!sharedPhotoIds.has(photo.id)) photoIdsToDelete.push(photo.id);
      continue;
    }

    if (sharedPhotoIds.has(photo.id)) {
      const [copy] = await executor
        .insert(locationPhotos)
        .values({
          location_id: newLocationId,
          attachment_id: photo.attachment_id,
          submission_id: photo.submission_id,
          uploaded_by: photo.uploaded_by,
          note: photo.note,
          taken_at: photo.taken_at,
        })
        .returning({ id: locationPhotos.id });
      if (!copy) continue;
      targetPhotoIdByAttachment.set(photo.attachment_id, copy.id);
      await repointSelection(selection, copy.id);
      continue;
    }

    photoIdsToMove.push(photo.id);
    targetPhotoIdByAttachment.set(photo.attachment_id, photo.id);
  }
  /* eslint-enable no-await-in-loop */

  for (const photo of unselectedOldPhotos) {
    const existingTargetId = targetPhotoIdByAttachment.get(photo.attachment_id);
    if (existingTargetId !== undefined) {
      photoIdsToDelete.push(photo.id);
      migratedPhotoIds.set(photo.id, existingTargetId);
    } else {
      photoIdsToMove.push(photo.id);
      targetPhotoIdByAttachment.set(photo.attachment_id, photo.id);
    }
  }

  if (photoIdsToDelete.length > 0) await executor.delete(locationPhotos).where(inArray(locationPhotos.id, photoIdsToDelete));
  if (photoIdsToMove.length > 0)
    await executor.update(locationPhotos).set({ location_id: newLocationId }).where(inArray(locationPhotos.id, photoIdsToMove));

  return migratedPhotoIds;
}
