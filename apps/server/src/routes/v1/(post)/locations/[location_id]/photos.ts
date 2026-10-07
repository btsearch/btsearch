import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { locationParamScope } from "../../../../../features/access/scope.js";
import { uploadLocationPhotos } from "../../../../../features/photos/upload.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { type PhotoFileFields, photoFileFields, photoFileShape } from "../../../../../utils/photoFiles.js";

const schemaRoute = {
  params: z.object({ location_id: z.coerce.number() }),
  response: {
    201: z.object({
      data: z.array(
        z.object({
          id: z.number(),
          attachment_uuid: z.string(),
          mime_type: z.string(),
          ...photoFileShape,
          createdAt: z.string(),
        }),
      ),
    }),
  },
};

type ReqParams = { Params: { location_id: number } };
type PhotoItem = PhotoFileFields & { id: number; attachment_uuid: string; mime_type: string; createdAt: string };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<PhotoItem[]>>) {
  const { location_id } = req.params;
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const isMultipart = (req.headers["content-type"] ?? "").includes("multipart/form-data");
  if (!isMultipart) throw new ErrorResponse("BAD_REQUEST");

  const location = await db.query.locations.findFirst({ where: { id: location_id } });
  if (!location) throw new ErrorResponse("NOT_FOUND");

  const uploaded = await uploadLocationPhotos(req, location_id, session.user.id);

  return res.code(201).send({
    data: uploaded.map(({ photo, attachment }) => ({
      id: photo.id,
      attachment_uuid: attachment.uuid,
      mime_type: attachment.mime_type,
      ...photoFileFields(attachment),
      createdAt: photo.createdAt.toISOString(),
    })),
  });
}

const uploadLocationPhotosRoute: Route<ReqParams, PhotoItem[]> = {
  url: "/locations/:location_id/photos",
  method: "POST",
  schema: schemaRoute,
  config: { permissions: ["update:stations"], scope: locationParamScope },
  handler,
};

export default uploadLocationPhotosRoute;
