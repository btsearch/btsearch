import { locationPhotos } from "@openbts/drizzle";
import { locationPhotoParamsSchema, photoSchema, photoUpdateSchema } from "@openbts/shared/contract";
import type { Photo, PhotoUpdate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../errors.js";
import { defineScope } from "../../../../../../features/access/scope.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../../features/audit/index.js";
import { findLocationPhoto, loadPhotoRowsByIds, serializePhotos } from "../../../../../../features/photos/read.js";
import { loadUserRefViewer } from "../../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a location photo",
  description: "Updates the note or date of a photo and returns the photo. Send `null` to clear a field. Fields you leave out are not changed.",
  params: locationPhotoParamsSchema,
  body: photoUpdateSchema,
  response: {
    200: z.object({
      data: photoSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, or `takenAt` is in the future.",
  403:
    "A permission is missing, or your editor access does not cover the location's country or region. " +
    "Editors also get this response when the location does not exist.",
  404: "The location does not exist, or it has no photo with this id.",
};
type RequestData = { Params: z.infer<typeof locationPhotoParamsSchema>; Body: PhotoUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Photo>>) {
  const { id, photoId } = req.params;
  const { note, takenAt } = req.body;

  const takenOn = takenAt === undefined || takenAt === null ? takenAt : new Date(takenAt);
  if (takenOn && takenOn > new Date()) throw new ErrorResponse("BAD_REQUEST", { message: "takenAt cannot be in the future" });

  const existing = await findLocationPhoto(id, photoId);
  if (!existing) throw new ErrorResponse("NOT_FOUND");

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "location.photos" }, async (tx, audit) => {
      const [current] = await tx.select().from(locationPhotos).where(eq(locationPhotos.id, existing.id)).for("update").limit(1);
      if (!current) throw new ErrorResponse("NOT_FOUND");

      const [updated] = await tx
        .update(locationPhotos)
        .set({ note: note === undefined ? undefined : note || null, taken_at: takenOn })
        .where(eq(locationPhotos.id, current.id))
        .returning();
      if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({
        entity: "location_photos",
        op: "update",
        recordId: current.id,
        old: current,
        new: updated,
        metadata: { location_id: id },
      });
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }

  const [photo] = await serializePhotos(await loadPhotoRowsByIds([existing.id]), await loadUserRefViewer(req));
  if (!photo) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: photo });
}

const updatePhoto: Route<RequestData, Photo> = {
  url: "/locations/:id/photos/:photoId",
  method: "PATCH",
  config: {
    permissions: ["update:stations"],
    scope: defineScope<RequestData>((req) => ({ locationIds: [req.params.id] })),
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updatePhoto;
