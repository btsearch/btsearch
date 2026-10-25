import { terrainProfileParamsSchema, terrainProfileQuerySchema, terrainProfileSchema } from "@openbts/shared/contract";
import type { TerrainProfile, TerrainProfileQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertCapabilityVisible } from "../../../../features/countries/visibility.js";
import {
  TERRAIN_PROFILE_POLL_SECONDS,
  getTerrainProfile,
  isTerrainProfileRunning,
  toTerrainProfile,
} from "../../../../features/terrainProfile/profiles.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a terrain profile",
  description:
    "While the status is `pending`, or the profile is `ready` with a `surfaceVerdict` of `pending`, wait the number of seconds " +
    "in the `Retry-After` and `X-Retry-After` headers before polling again. " +
    "An analysis whose antenna and ground heights take longer than the time limit, one minute by default, fails. " +
    "The heights of buildings and trees follow later, within five minutes by default. If they do not arrive, `surfaceVerdict` becomes `unknown`. " +
    "The status `cancelled` means the profile was stopped with `DELETE /terrain-profiles/{id}`.",
  params: terrainProfileParamsSchema,
  querystring: terrainProfileQuerySchema,
  response: {
    200: z.object({
      data: terrainProfileSchema,
    }),
  },
};
const errorReasons = {
  404: "The profile does not exist or has expired, or you cannot access any country that has terrain profiles.",
  429: "Reading and cancelling profiles share a limit of 120 requests per minute.",
  503: "The rate limit counter is unavailable.",
};
type RequestData = { Params: z.infer<typeof terrainProfileParamsSchema>; Querystring: TerrainProfileQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<TerrainProfile>>) {
  await assertCapabilityVisible(req, "terrainProfiles");

  const profile = await getTerrainProfile(req.params.id);

  if (isTerrainProfileRunning(profile)) {
    res.header("Retry-After", String(TERRAIN_PROFILE_POLL_SECONDS));
    res.header("X-Retry-After", String(TERRAIN_PROFILE_POLL_SECONDS));
  }
  return res.send({ data: toTerrainProfile(profile, req.query.include) });
}

const getTerrainProfileRoute: Route<RequestData, TerrainProfile> = {
  url: "/terrain-profiles/:id",
  method: "GET",
  config: { allowGuestAccess: true, permissions: ["read:stations", "read:official_permits"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getTerrainProfileRoute;
