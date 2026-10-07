import { stationHistoryListSchema, stationHistoryQuerySchema, stationParamsSchema } from "@openbts/shared/contract";
import type { StationHistoryList, StationHistoryQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { readStationHistory } from "../../../../../features/stations/historyRead.js";
import { findVisibleStation } from "../../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List a station's history",
  description:
    "Returns the changes made to a station, newest first. " +
    "Changes to the location the station stands on are included as well, starting from the moment the station was created. " +
    "A page can contain fewer items than `limit` even when there are more, so keep reading until `nextCursor` is `null`.",
  params: stationParamsSchema,
  querystring: stationHistoryQuerySchema,
  response: {
    200: stationHistoryListSchema,
  },
};
type RequestData = { Params: z.infer<typeof stationParamsSchema>; Querystring: StationHistoryQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<StationHistoryList>>) {
  const station = await findVisibleStation(req, req.params.id);
  return res.send(await readStationHistory(req, station, req.query));
}

const getStationHistory: Route<RequestData, StationHistoryList> = {
  url: "/stations/:id/history",
  method: "GET",
  config: {
    permissions: ["read:stations"],
    allowGuestAccess: true,
    errorReasons: { 404: "The station does not exist, or it is in a country you cannot access." },
  },
  schema: schemaRoute,
  handler,
};

export default getStationHistory;
