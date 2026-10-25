import { engineRunCreateSchema, engineRunSchema } from "@openbts/shared/contract";
import type { EngineRun, EngineRunCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { startEngineRun } from "../../../../../features/observed/engine/runs.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqBody = { Body: EngineRunCreate };

const schemaRoute = {
  summary: "Start an engine run",
  description:
    "The engine takes runs one at a time, oldest first. You cannot start subtractions, restores or rebuilds: the uploads that need them queue them.",
  tags: ["observation-engine"],
  body: engineRunCreateSchema,
  response: {
    201: z.object({
      data: engineRunSchema,
    }),
  },
};

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<EngineRun>>) {
  return res.status(201).send({ data: await startEngineRun(req, req.body) });
}

const startObservationEngineRun: Route<ReqBody, EngineRun> = {
  url: "/observed/engine/runs",
  method: "POST",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default startObservationEngineRun;
