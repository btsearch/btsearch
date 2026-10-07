import { stationWatches } from "@openbts/drizzle";
import { noContentSchema, stationParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { accountOwnerId } from "../../../../../features/notifications/owner.js";
import { findVisibleStation } from "../../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Watch a station",
  description:
    "Starts watching a station. " +
    "You are then notified when its cells change, an approved submission adds photos to it, " +
    "a comment on it is approved or its official permits change. " +
    "Watching a station you already watch changes nothing and returns 204 as well.",
  params: stationParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  401: "You are not signed in, or the token you sent is invalid. API keys cannot be used here, because a watch belongs to a user account.",
  404: "The station does not exist, or it is in a country you cannot access.",
};
type ReqParams = { Params: z.infer<typeof stationParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const userId = accountOwnerId(req);
  const station = await findVisibleStation(req, req.params.id);

  await db
    .insert(stationWatches)
    .values({ userId, stationId: station.id })
    .onConflictDoNothing({ target: [stationWatches.userId, stationWatches.stationId] });

  return res.status(204).send();
}

const watchStation: Route<ReqParams, void> = {
  url: "/stations/:id/watch",
  method: "PUT",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default watchStation;
