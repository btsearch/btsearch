import { noContentSchema, terrainProfileParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { assertCapabilityVisible } from "../../../../features/countries/visibility.js";
import { cancelTerrainProfile } from "../../../../features/terrainProfile/profiles.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Cancel a terrain profile",
  description:
    "A `pending` profile becomes `cancelled`, and you can keep reading it until it expires. " +
    "A profile that is already ready, failed or cancelled is left as it is, and you still get 204. " +
    "Profiles have no owner, so anyone who knows the id can cancel one.",
  params: terrainProfileParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  404: "The profile does not exist or has expired, or you cannot access any country that has terrain profiles.",
  429: "Reading and cancelling profiles share a limit of 120 requests per minute.",
  503: "The rate limit counter is unavailable.",
};
type ReqParams = { Params: z.infer<typeof terrainProfileParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  await assertCapabilityVisible(req, "terrainProfiles");

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
