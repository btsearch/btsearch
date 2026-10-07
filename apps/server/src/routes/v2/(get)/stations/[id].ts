import { stationParamsSchema, stationQuerySchema, stationSchema } from "@openbts/shared/contract";
import type { Station, StationQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { readStation } from "../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a station",
  description: "Returns a single station. Inactive stations are returned too, even though `GET /stations` leaves them out by default.",
  params: stationParamsSchema,
  querystring: stationQuerySchema,
  response: {
    200: z.object({
      data: stationSchema,
    }),
  },
};
type RequestData = { Params: z.infer<typeof stationParamsSchema>; Querystring: StationQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Station>>) {
  return res.send({ data: await readStation(req, req.params.id, req.query.include) });
}

const getStation: Route<RequestData, Station> = {
  url: "/stations/:id",
  method: "GET",
  config: {
    permissions: ["read:stations"],
    allowGuestAccess: true,
    errorReasons: { 404: "The station does not exist, or it is in a country you cannot access." },
  },
  schema: schemaRoute,
  handler,
};

export default getStation;
