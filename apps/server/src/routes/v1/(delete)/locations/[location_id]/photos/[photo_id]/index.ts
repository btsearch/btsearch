import { attachments, locationPhotos, stationPhotoSelections } from "@openbts/drizzle";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../../interfaces/routes.interface.js";
import {
  auditContextFromRequest,
  loadPhotoSelectionSnapshots,
  logPhotoSelectionChanges,
  runAuditedOperation,
} from "../../../../../../../services/audit/index.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const schemaRoute = {
  params: z.object({ location_id: z.coerce.number(), photo_id: z.coerce.number() }),
  response: { 204: z.object({}) },
};

type ReqParams = { Params: { location_id: number; photo_id: number } };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Record<never, never>>>) {
  const { location_id, photo_id } = req.params;
  if (!req.userSession?.user) throw new ErrorResponse("UNAUTHORIZED");

  const attachmentUuid = await runAuditedOperation(auditContextFromRequest(req), { kind: "location.photos" }, async (tx, audit) => {
    const photo = await tx.query.locationPhotos.findFirst({ where: { id: photo_id, location_id } });
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

    await tx.delete(locationPhotos).where(and(eq(locationPhotos.id, photo_id), eq(locationPhotos.location_id, location_id)));
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
  });

  if (attachmentUuid !== null)
    try {
      await fs.unlink(path.join(UPLOAD_DIR, `${attachmentUuid}.webp`));
    } catch {}

  return res.code(204).send({});
}

const deleteLocationPhoto: Route<ReqParams, Record<never, never>> = {
  url: "/locations/:location_id/photos/:photo_id",
  method: "DELETE",
  schema: schemaRoute,
  config: { permissions: ["update:stations"] },
  handler,
};

export default deleteLocationPhoto;
