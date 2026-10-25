import { engineStateSchema } from "@openbts/shared/contract";
import type { EngineState } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadEngineState } from "../../../../features/observed/engine/state.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get the engine's state",
  description: "The numbers are read when you ask, not cached.",
  tags: ["observation-engine"],
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: engineStateSchema,
    }),
  },
};

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<EngineState>>) {
  return res.send({ data: await loadEngineState() });
}

const getObservationEngine: Route<RouteGenericInterface, EngineState> = {
  url: "/observed/engine",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default getObservationEngine;
