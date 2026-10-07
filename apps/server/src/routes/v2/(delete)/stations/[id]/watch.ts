import { stationWatches } from "@openbts/drizzle";
import { noContentSchema, stationParamsSchema } from "@openbts/shared/contract";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { accountOwnerId } from "../../../../../features/notifications/owner.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Stop watching a station",
  description: "Stops watching a station. Returns 204 even if you were not watching it, or if the station does not exist.",
  params: stationParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  401: "You are not signed in, or the token you sent is invalid. API keys cannot be used here, because a watch belongs to a user account.",
  404: null,
};
type ReqParams = { Params: z.infer<typeof stationParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const userId = accountOwnerId(req);

  await db.delete(stationWatches).where(and(eq(stationWatches.userId, userId), eq(stationWatches.stationId, req.params.id)));

  return res.status(204).send();
}

const unwatchStation: Route<ReqParams, void> = {
  url: "/stations/:id/watch",
  method: "DELETE",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default unwatchStation;
