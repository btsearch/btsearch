import { terrainProfileCreateSchema, terrainProfileQuerySchema, terrainProfileSchema } from "@openbts/shared/contract";
import type { TerrainProfile, TerrainProfileCreate, TerrainProfileQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertCapabilityVisible } from "../../../../features/countries/visibility.js";
import { TERRAIN_PROFILE_POLL_SECONDS, createTerrainProfile, toTerrainProfile } from "../../../../features/terrainProfile/profiles.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { UNLIMITED, countAgainstLimit } from "../../../../lib/requestLimit.js";
import type { RouteRateLimit } from "../../../../plugins/ratelimit/rateLimiter.js";

const NEW_PROFILE_LIMIT: RouteRateLimit = { url: "terrain-profile-start", max: 15, window: 300, roles: { admin: UNLIMITED, editor: UNLIMITED } };

const profileResponseSchema = z.object({ data: terrainProfileSchema });
const schemaRoute = {
  summary: "Create a terrain profile",
  description:
    "Starts a line-of-sight analysis between one antenna of a station and a receiver location, and returns the profile right away. " +
    "The analysis runs in the background, so a new profile has the status `pending`. Poll `GET /terrain-profiles/{id}` until the status " +
    "changes. While it is pending, the `Retry-After` and `X-Retry-After` headers tell you how many seconds to wait before the next request.\n\n" +
    "You get 201 when a new analysis was started. You get 200 when the same station, antenna and receiver were requested within the last " +
    "hour, and the response is that earlier profile, which can be pending or ready. Failed and cancelled profiles are never reused.\n\n" +
    "Send either `stationId` or `officialSiteId`, not both. An `antennaKey` the station does not have is not rejected here. " +
    "The profile is created and then fails with the reason `antennaNotFound`. " +
    "The antenna and elevation data connected so far only cover some countries. The station has to be in one where " +
    "`capabilities.terrainProfiles` in `GET /countries` is not `null`, and the receiver inside its `receiverBounds`.",
  querystring: terrainProfileQuerySchema,
  body: terrainProfileCreateSchema,
  response: {
    200: profileResponseSchema.describe("The same station, antenna and receiver were requested within the last hour, so that profile is returned."),
    201: profileResponseSchema.describe("A new analysis has been started."),
  },
};
const errorReasons = {
  400:
    "The request is invalid, the receiver is outside the `receiverBounds` of the station's country, " +
    "or it is closer than 10 m to the station or farther than 30 km, which is the default maximum.",
  404:
    "The station or official site does not exist or has no location, or it is in a country where `capabilities.terrainProfiles` is `null`. " +
    "Also returned when you cannot access any country that has terrain profiles.",
  429:
    "You can start up to 15 new profiles every 5 minutes. Requests that return an existing profile do not count, and editors and " +
    "administrators have no limit unless they use an API key. The general rate limits apply as well.",
  503: "The rate limit counter is unavailable, so a new profile cannot be started right now. Try again later.",
};
type RequestData = { Querystring: TerrainProfileQuery; Body: TerrainProfileCreate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<TerrainProfile>>) {
  await assertCapabilityVisible(req, "terrainProfiles");

  const { profile, isNew } = await createTerrainProfile(req.body, () => countAgainstLimit(req, res, NEW_PROFILE_LIMIT));

  if (profile.status === "pending") {
    res.header("Retry-After", String(TERRAIN_PROFILE_POLL_SECONDS));
    res.header("X-Retry-After", String(TERRAIN_PROFILE_POLL_SECONDS));
  }
  return res.status(isNew ? 201 : 200).send({ data: toTerrainProfile(profile, req.query.include) });
}

const createTerrainProfileRoute: Route<RequestData, TerrainProfile> = {
  url: "/terrain-profiles",
  method: "POST",
  config: { allowGuestAccess: true, permissions: ["read:stations", "read:official_permits"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default createTerrainProfileRoute;
