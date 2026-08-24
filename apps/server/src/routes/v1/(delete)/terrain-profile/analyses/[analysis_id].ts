import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { cancelTerrainProfileAnalysis } from "../../../../../services/terrainProfile/terrainProfile.service.js";

const schemaRoute = {
  params: z.object({ analysis_id: z.uuid() }),
  response: { 204: z.undefined() },
};

type RequestParams = { Params: { analysis_id: string } };

async function handler(req: FastifyRequest<RequestParams>, res: ReplyPayload<JSONBody<undefined>>) {
  await cancelTerrainProfileAnalysis(req.params.analysis_id);
  return res.status(204).send();
}

const cancelAnalysis: Route<RequestParams, undefined> = {
  method: "DELETE",
  url: "/terrain-profile/analyses/:analysis_id",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default cancelAnalysis;
