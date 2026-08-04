import { attachments, locationPhotos, locations } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";

import type { Database } from "../database/psql.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function deleteLocationWithPhotos(executor: Database | Transaction, locationId: number) {
  const photos = await executor.query.locationPhotos.findMany({
    where: { location_id: locationId },
    with: { attachment: { columns: { id: true, uuid: true } } },
  });

  await executor.delete(locations).where(eq(locations.id, locationId));

  const attachmentIds = photos.map((p) => p.attachment.id);
  if (attachmentIds.length === 0) return;

  const stillReferenced = await executor
    .select({ attachment_id: locationPhotos.attachment_id })
    .from(locationPhotos)
    .where(inArray(locationPhotos.attachment_id, attachmentIds));
  const stillReferencedIds = new Set(stillReferenced.map((row) => row.attachment_id));
  const deletablePhotos = photos.filter((p) => !stillReferencedIds.has(p.attachment.id));
  if (deletablePhotos.length === 0) return;

  await executor.delete(attachments).where(
    inArray(
      attachments.id,
      deletablePhotos.map((p) => p.attachment.id),
    ),
  );

  await Promise.all(deletablePhotos.map((p) => fs.unlink(path.join(UPLOAD_DIR, `${p.attachment.uuid}.webp`)).catch(() => {})));
}
