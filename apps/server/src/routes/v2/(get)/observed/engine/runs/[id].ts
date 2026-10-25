import { engineRunParamsSchema, engineRunSchema } from "@openbts/shared/contract";
import type { EngineRun } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { findEngineRun } from "../../../../../../features/observed/engine/runs.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

type ReqParams = { Params: z.infer<typeof engineRunParamsSchema> };

const schemaRoute = {
  summary: "Get an engine run",
  description: "A running run writes its `progress` every few seconds.",
  tags: ["observation-engine"],
  params: engineRunParamsSchema,
  response: {
    200: z.object({
      data: engineRunSchema,
    }),
  },
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<EngineRun>>) {
  return res.send({ data: await findEngineRun(req.params.id) });
}

const getObservationEngineRun: Route<ReqParams, EngineRun> = {
  url: "/observed/engine/runs/:id",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default getObservationEngineRun;
