import { noContentSchema, terrainProfileParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { cancelTerrainProfile } from "../../../../features/terrainProfile/profiles.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Cancel a terrain profile",
  description:
    "Cancels a profile that is still `pending`. Its status becomes `cancelled`, and you can keep reading it until it expires. " +
    "If the profile is already ready, failed or cancelled, nothing changes and you still get 204. " +
    "Profiles have no owner, so anyone who knows the id can cancel one.",
  params: terrainProfileParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  404: "The profile does not exist or has expired.",
  429:
    "You can make up to 120 requests per minute to this path, and reading and cancelling profiles count together. " +
    "The weekly quota of your API key applies as well.",
  503: "The rate limit counter is unavailable. Try again later.",
};
type ReqParams = { Params: z.infer<typeof terrainProfileParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  await cancelTerrainProfile(req.params.id);
  return res.status(204).send();
}

const cancelTerrainProfileRoute: Route<ReqParams, void> = {
  url: "/terrain-profiles/:id",
  method: "DELETE",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default cancelTerrainProfileRoute;
