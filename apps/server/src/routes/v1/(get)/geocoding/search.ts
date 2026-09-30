import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import { searchPlaces } from "../../../../features/geocoding/service.js";
import { type GeocodingSearchResponse, GeocodingSearchResponseSchema } from "../../../../features/geocoding/types.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { firstPartyOnlyHook } from "../../../../middlewares/firstParty.middleware.js";

const schemaRoute = {
  querystring: z.object({
    q: z.string().trim().min(3).max(200),
  }),
  response: {
    200: z.object({
      data: GeocodingSearchResponseSchema,
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<GeocodingSearchResponse>>) {
  const data = await searchPlaces(req.query.q);
  return res.send({ data });
}

const searchGeocoding: Route<ReqQuery, GeocodingSearchResponse> = {
  url: "/geocoding/search",
  method: "GET",
  onRequest: [firstPartyOnlyHook],
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default searchGeocoding;
