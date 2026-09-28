import { attachments, locationPhotos, locations } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";

import type { AuditRecorder } from "../audit/index.js";

export async function deleteLocationWithPhotos(audit: AuditRecorder, locationId: number, stationId?: number): Promise<string[]> {
  const location = await audit.tx.query.locations.findFirst({ where: { id: locationId } });
  if (location === undefined) return [];

  const photos = await audit.tx
    .select({ photo: locationPhotos, attachmentId: attachments.id, attachmentUuid: attachments.uuid })
    .from(locationPhotos)
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .where(eq(locationPhotos.location_id, locationId));

  await audit.tx.delete(locations).where(eq(locations.id, locationId));
  await audit.logMany([
    ...photos.map(({ photo }) => ({
      entity: "location_photos" as const,
      op: "delete" as const,
      recordId: photo.id,
      stationId,
      old: photo,
      metadata: { location_id: locationId },
    })),
    {
      entity: "locations",
      op: "delete",
      recordId: locationId,
      stationId,
      old: location,
    },
  ]);

  const attachmentIds = photos.map(({ attachmentId }) => attachmentId);
  if (attachmentIds.length === 0) return [];

  const stillReferenced = await audit.tx
    .select({ attachment_id: locationPhotos.attachment_id })
    .from(locationPhotos)
    .where(inArray(locationPhotos.attachment_id, attachmentIds));
  const stillReferencedIds = new Set(stillReferenced.map((row) => row.attachment_id));
  const deletablePhotos = photos.filter(({ attachmentId }) => !stillReferencedIds.has(attachmentId));
  if (deletablePhotos.length === 0) return [];

  await audit.tx.delete(attachments).where(
    inArray(
      attachments.id,
      deletablePhotos.map(({ attachmentId }) => attachmentId),
    ),
  );
  return deletablePhotos.map(({ attachmentUuid }) => attachmentUuid);
}
