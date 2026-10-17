import { stationWatches } from "@openbts/drizzle";
import { stationParamsSchema, stationWatchSchema } from "@openbts/shared/contract";
import type { StationWatch } from "@openbts/shared/contract";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { accountOwnerId } from "../../../../../features/notifications/owner.js";
import { findVisibleStation } from "../../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a station's watch status",
  params: stationParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: stationWatchSchema,
    }),
  },
};
const errorReasons = {
  401: "API keys cannot be used here, because a watch belongs to a user account.",
};
type ReqParams = { Params: z.infer<typeof stationParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<StationWatch>>) {
  const userId = accountOwnerId(req);
  const station = await findVisibleStation(req, req.params.id);

  const [watch] = await db
    .select({ id: stationWatches.id })
    .from(stationWatches)
    .where(and(eq(stationWatches.userId, userId), eq(stationWatches.stationId, station.id)))
    .limit(1);

  return res.send({ data: { isWatched: watch !== undefined } });
}

const getStationWatch: Route<ReqParams, StationWatch> = {
  url: "/stations/:id/watch",
  method: "GET",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default getStationWatch;
