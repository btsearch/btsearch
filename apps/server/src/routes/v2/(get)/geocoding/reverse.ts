import { geocodedPlaceSchema, geocodingReverseQuerySchema } from "@openbts/shared/contract";
import type { GeocodedPlace, GeocodingReverseQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { toGeocodedPlace } from "../../../../features/geocoding/serialize.js";
import { reverseGeocode } from "../../../../features/geocoding/service.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { firstPartyOnlyHook } from "../../../../middlewares/firstParty.middleware.js";

const schemaRoute = {
  summary: "Look up the place at coordinates",
  description:
    "Returns the place found at the given coordinates. It is meant for the site's own forms.\n\n" +
    "Only the site itself can use this endpoint. The request has to come from one of the site's pages, which the server checks with the " +
    "`Sec-Fetch-Site`, `Origin` and `Referer` headers. Anything else gets a 403 before credentials, parameters or rate limits are checked.\n\n" +
    "The lookup is forwarded to an external geocoding provider, and `source` tells you which provider the result came from. " +
    "If the providers do not support the requested `language`, the result is in English. Results are cached for a day. " +
    "`data` is `null` if nothing is found at the coordinates, or if the server has no geocoding provider configured.",
  querystring: geocodingReverseQuerySchema,
  response: {
    200: z.object({
      data: geocodedPlaceSchema.nullable(),
    }),
  },
};
const errorReasons = {
  403:
    "The request did not come from the site itself. Also returned when your API key or token cannot be used for this endpoint, " +
    "two-factor authentication still has to be set up, or the endpoint is disabled.",
  429: "You can make up to 5 lookups per minute. Editors and administrators have no limit.",
  503: "Every geocoding provider failed and there is no cached result to fall back on, or the rate limit counter is unavailable. Try again later.",
};
type ReqQuery = { Querystring: GeocodingReverseQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<GeocodedPlace | null>>) {
  const { latitude, longitude, language } = req.query;

  const { source, result } = await reverseGeocode(latitude, longitude, language);

  return res.send({ data: source === null || result === null ? null : toGeocodedPlace(result, source) });
}

const reverseGeocoding: Route<ReqQuery, GeocodedPlace | null> = {
  url: "/geocoding/reverse",
  method: "GET",
  onRequest: [firstPartyOnlyHook],
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default reverseGeocoding;
