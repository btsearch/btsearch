import { officialLocationParamsSchema, officialLocationQuerySchema, officialLocationSchema } from "@openbts/shared/contract";
import type { OfficialLocation, OfficialLocationQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { readOfficialLocation } from "../../../../../features/official/locations.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an official location",
  description:
    "Returns a single location of an official register. The site filters never hide the location itself. " +
    "They only select which sites are included with `include=sites`, and `rats` and `bandLabels` also select their permits. " +
    "With `keepOtherCountries=true`, `operatorIds` is only applied if the location is in a country its operators belong to.",
  params: officialLocationParamsSchema,
  querystring: officialLocationQuerySchema,
  response: {
    200: z.object({
      data: officialLocationSchema,
    }),
  },
};
const errorReasons = {
  403:
    "Lists are disabled and you sent `listId`. Also returned when your API key or token cannot be used for this endpoint, " +
    "two-factor authentication still has to be set up, or the endpoint is disabled.",
  404:
    "The location does not exist, its source is hidden, or it is in a country you cannot access. " +
    "Also returned when the list in `listId` does not exist or is a private list you cannot access.",
};
type RequestData = { Params: z.infer<typeof officialLocationParamsSchema>; Querystring: OfficialLocationQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<OfficialLocation>>) {
  return res.send({ data: await readOfficialLocation(req, req.params.id, req.query) });
}

const getOfficialLocation: Route<RequestData, OfficialLocation> = {
  url: "/official/locations/:id",
  method: "GET",
  config: { permissions: ["read:official_permits"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getOfficialLocation;
