import { photoOwnerParamsSchema, photoQuerySchema, photoSchema } from "@openbts/shared/contract";
import type { Photo, PhotoQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadStationPhotoRows, serializePhotos } from "../../../../../features/photos/read.js";
import { findVisibleStation } from "../../../../../features/stations/read.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List a station's photos",
  description:
    "Returns the photos a station shows, which are picked from the photos of its location. " +
    "The main photo comes first, followed by the others from oldest to newest. " +
    "`selections` lists every station that shows a photo, not just this one. " +
    "An author's `name` is `null` when their profile is not public, " +
    "unless you are signed in as an editor or an administrator, or you are the author yourself.",
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
  await findVisibleStation(req, id);

  const [rows, viewer] = await Promise.all([loadStationPhotoRows(id), loadUserRefViewer(req)]);

  return res.send({ data: await serializePhotos(rows, viewer, req.query.include) });
}

const getStationPhotos: Route<RequestData, Photo[]> = {
  url: "/stations/:id/photos",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons: { 404: "The station does not exist, or it is in a country you cannot access." } },
  schema: schemaRoute,
  handler,
};

export default getStationPhotos;
