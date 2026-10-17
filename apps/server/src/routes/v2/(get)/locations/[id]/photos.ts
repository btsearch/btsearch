import { photoOwnerParamsSchema, photoQuerySchema, photoSchema } from "@openbts/shared/contract";
import type { Photo, PhotoQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadLocationPhotoRows, serializePhotos } from "../../../../../features/photos/read.js";
import { findVisibleLocation } from "../../../../../features/stations/read.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List a location's photos",
  description: "Returns every photo uploaded to the location, newest upload first, including photos that no station shows.",
  params: photoOwnerParamsSchema,
  querystring: photoQuerySchema,
  response: {
    200: z.object({
      data: z.array(photoSchema),
    }),
  },
};
type RequestData = { Params: z.infer<typeof photoOwnerParamsSchema>; Querystring: PhotoQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Photo[]>>) {
  const { id } = req.params;
  await findVisibleLocation(req, id);

  const [rows, viewer] = await Promise.all([loadLocationPhotoRows(id), loadUserRefViewer(req)]);

  return res.send({ data: await serializePhotos(rows, viewer, req.query.include) });
}

const getLocationPhotos: Route<RequestData, Photo[]> = {
  url: "/locations/:id/photos",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getLocationPhotos;
