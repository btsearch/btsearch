import { terrainProfileParamsSchema, terrainProfileQuerySchema, terrainProfileSchema } from "@openbts/shared/contract";
import type { TerrainProfile, TerrainProfileQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertEmfCountryVisible } from "../../../../features/emf/site.js";
import { TERRAIN_PROFILE_POLL_SECONDS, getTerrainProfile, toTerrainProfile } from "../../../../features/terrainProfile/profiles.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a terrain profile",
  description:
    "Returns a terrain profile with its current status.\n\n" +
    "- Poll this endpoint while the status is `pending`, and wait the number of seconds " +
    "given in the `Retry-After` and `X-Retry-After` headers between requests.\n" +
    "- The analysis is done when the status is `ready`, and `result` then holds its outcome.\n" +
    "- If the status is `failed`, `failure` tells you why. An analysis that takes longer than the time limit, one minute by default, fails.\n" +
    "- The status `cancelled` means the profile was stopped with `DELETE /terrain-profiles/{id}`.\n\n" +
    "A profile is kept for an hour after its last change, as shown in `expiresAt`, and is then deleted.",
  params: terrainProfileParamsSchema,
  querystring: terrainProfileQuerySchema,
  response: {
    200: z.object({
      data: terrainProfileSchema,
    }),
  },
};
const errorReasons = {
  404: "The profile does not exist or has expired. Also returned when you cannot access Poland, the country this data covers.",
  429:
    "You can make up to 120 requests per minute to this path, and reading and cancelling profiles count together. " +
    "The weekly quota of your API key applies as well.",
  503: "The rate limit counter is unavailable. Try again later.",
};
type RequestData = { Params: z.infer<typeof terrainProfileParamsSchema>; Querystring: TerrainProfileQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<TerrainProfile>>) {
  await assertEmfCountryVisible(req);

  const profile = await getTerrainProfile(req.params.id);

  if (profile.status === "pending") {
    res.header("Retry-After", String(TERRAIN_PROFILE_POLL_SECONDS));
    res.header("X-Retry-After", String(TERRAIN_PROFILE_POLL_SECONDS));
  }
  return res.send({ data: toTerrainProfile(profile, req.query.include) });
}

const getTerrainProfileRoute: Route<RequestData, TerrainProfile> = {
  url: "/terrain-profiles/:id",
  method: "GET",
  config: { allowGuestAccess: true, permissions: ["read:stations", "read:uke_permits"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getTerrainProfileRoute;
