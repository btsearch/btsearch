import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createTerrainProfileAnalysis } from "../../../../services/terrainProfile/terrainProfile.service.js";
import { TerrainProfileAnalysisSchema, type TerrainProfileRequest, TerrainProfileRequestSchema } from "../../../../services/terrainProfile/types.js";

const responseSchema = z.object({ data: TerrainProfileAnalysisSchema });
const schemaRoute = {
  body: TerrainProfileRequestSchema,
  response: { 200: responseSchema },
};

type RequestBody = { Body: TerrainProfileRequest };
type ResponseBody = z.infer<typeof responseSchema>;

async function handler(req: FastifyRequest<RequestBody>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const analysis = await createTerrainProfileAnalysis(req.body);
  return res.status(200).send({ data: analysis });
}

const createAnalysis: Route<RequestBody, ResponseBody> = {
  method: "POST",
  url: "/terrain-profile/analyses",
  config: { allowGuestAccess: true, permissions: ["read:stations", "read:uke_permits"] },
  schema: schemaRoute,
  handler,
};

export default createAnalysis;
