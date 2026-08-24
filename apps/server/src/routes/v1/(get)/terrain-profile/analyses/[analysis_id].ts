import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getTerrainProfileAnalysis } from "../../../../../services/terrainProfile/terrainProfile.service.js";
import { TerrainProfileAnalysisSchema } from "../../../../../services/terrainProfile/types.js";

const paramsSchema = z.object({ analysis_id: z.uuid() });
const responseSchema = z.object({ data: TerrainProfileAnalysisSchema });
const schemaRoute = {
  params: paramsSchema,
  response: { 200: responseSchema },
};

type RequestParams = { Params: z.infer<typeof paramsSchema> };
type ResponseBody = z.infer<typeof responseSchema>;

async function handler(req: FastifyRequest<RequestParams>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  return res.send({ data: await getTerrainProfileAnalysis(req.params.analysis_id) });
}

const getAnalysis: Route<RequestParams, ResponseBody> = {
  method: "GET",
  url: "/terrain-profile/analyses/:analysis_id",
  config: { allowGuestAccess: true, permissions: ["read:stations", "read:uke_permits"] },
  schema: schemaRoute,
  handler,
};

export default getAnalysis;
