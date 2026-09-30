import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import { reverseGeocode } from "../../../../features/geocoding/service.js";
import { type ReverseGeocodingResponse, ReverseGeocodingResponseSchema } from "../../../../features/geocoding/types.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { firstPartyOnlyHook } from "../../../../middlewares/firstParty.middleware.js";

const schemaRoute = {
  querystring: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }),
  response: {
    200: z.object({
      data: ReverseGeocodingResponseSchema,
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ReverseGeocodingResponse>>) {
  const data = await reverseGeocode(req.query.lat, req.query.lng);
  return res.send({ data });
}

const reverseGeocoding: Route<ReqQuery, ReverseGeocodingResponse> = {
  url: "/geocoding/reverse",
  method: "GET",
  onRequest: [firstPartyOnlyHook],
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default reverseGeocoding;
