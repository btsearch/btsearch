import { locationPhotoUploadSchema, photoOwnerParamsSchema, photoSchema } from "@openbts/shared/contract";
import type { Photo } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { actorIdFromRequest } from "../../../../../features/access/access.js";
import { defineScope } from "../../../../../features/access/scope.js";
import { loadPhotoRowsByIds, serializePhotos } from "../../../../../features/photos/read.js";
import { uploadLocationPhotos } from "../../../../../features/photos/upload.js";
import { findVisibleLocation } from "../../../../../features/stations/read.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Upload photos to a location",
  description:
    "Uploads one or more photos to a location and returns them, with you as their author. " +
    "If one file is invalid, none of the files in the request is saved. " +
    "Photos are re-encoded on the server, which removes their metadata, including the GPS position. " +
    "New photos belong to the location and are not shown on any station until they are selected for it, " +
    "for example with `PUT /stations/{id}/photos`.",
  params: photoOwnerParamsSchema,
  response: {
    201: z.object({
      data: z.array(photoSchema),
    }),
  },
};
const errorReasons = {
  400:
    "The request is not `multipart/form-data` or contains no file, a `takenAts` value is not a valid date or is in the future, " +
    "or a file was not accepted. Files must be readable images of at most 20 MB, at least 640 by 480 pixels (`PHOTO_TOO_SMALL`) " +
    "and not too blurry (`PHOTO_TOO_BLURRY`).",
  403:
    "A permission is missing, or your editor access does not cover the location's country or region. " +
    "Editors also get this response when the location does not exist.",
  404: "The location does not exist.",
};
type ReqParams = { Params: z.infer<typeof photoOwnerParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Photo[]>>) {
  const { id } = req.params;
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  if (!(req.headers["content-type"] ?? "").includes("multipart/form-data")) {
    throw new ErrorResponse("BAD_REQUEST", { message: "Photos must be sent as multipart/form-data" });
  }
  await findVisibleLocation(req, id);

  const uploaded = await uploadLocationPhotos(req, id, userId);
  const rows = await loadPhotoRowsByIds(uploaded.map(({ photo }) => photo.id));

  return res.status(201).send({ data: await serializePhotos(rows, await loadUserRefViewer(req)) });
}

const uploadPhotos: Route<ReqParams, Photo[]> = {
  url: "/locations/:id/photos",
  method: "POST",
  config: {
    permissions: ["update:stations"],
    scope: defineScope<ReqParams>((req) => ({ locationIds: [req.params.id] })),
    multipartBody: locationPhotoUploadSchema,
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default uploadPhotos;
