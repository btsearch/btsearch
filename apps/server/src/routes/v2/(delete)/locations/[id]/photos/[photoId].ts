import { locationPhotoParamsSchema, noContentSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../errors.js";
import { defineScope } from "../../../../../../features/access/scope.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../../features/audit/index.js";
import { findLocationPhoto, findLocationPhotoIds } from "../../../../../../features/photos/read.js";
import { removeLocationPhoto } from "../../../../../../features/photos/write.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../../interfaces/routes.interface.js";
import { deletePhotoFiles } from "../../../../../../utils/photoFiles.js";

const schemaRoute = {
  summary: "Delete a location photo",
  description:
    "Deletes a photo permanently. It is removed from this location, from any other location that uses the same file " +
    "and from every station that shows it, and the image files are deleted. " +
    "As an editor you need access to all of those locations.",
  params: locationPhotoParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  403:
    "A permission is missing, or your editor access does not cover every location that uses the photo. " +
    "Editors can also get this response when the location does not exist.",
  404: "The location does not exist, or it has no photo with this id.",
};
type ReqParams = { Params: z.infer<typeof locationPhotoParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id, photoId } = req.params;

  const photo = await findLocationPhoto(id, photoId);
  if (!photo) throw new ErrorResponse("NOT_FOUND");

  let fileId: string | null;
  try {
    fileId = await runAuditedOperation(standaloneAuditContext(req), { kind: "location.photos" }, (tx, audit) =>
      removeLocationPhoto(tx, audit, id, photo.id),
    );
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
  if (fileId !== null) await deletePhotoFiles([fileId]);

  return res.status(204).send();
}

const deletePhoto: Route<ReqParams, void> = {
  url: "/locations/:id/photos/:photoId",
  method: "DELETE",
  config: {
    permissions: ["update:stations"],
    scope: defineScope<ReqParams>(async (req) => ({
      locationIds: [req.params.id],
      locationPhotoIds: await findLocationPhotoIds(req.params.photoId),
    })),
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default deletePhoto;
