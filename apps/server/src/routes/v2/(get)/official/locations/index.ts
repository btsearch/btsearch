import { officialLocationListQuerySchema, officialLocationListSchema } from "@openbts/shared/contract";
import type { OfficialLocationList, OfficialLocationListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchOfficialLocationPage } from "../../../../../features/official/locations.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List official locations",
  description:
    "A location holds the official sites at that place, and each site holds the permits issued for it.\n\n" +
    "The site filters (`operatorIds`, `rats`, `bandLabels`, `createdAfter`, `updatedAfter`, `changedAfter` and `listId`) select sites, " +
    "and a location is only returned if at least one of its sites matches.",
  querystring: officialLocationListQuerySchema,
  response: {
    200: officialLocationListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
  403: "Lists are disabled and you sent `listId`.",
  404: "The list in `listId` does not exist, or it is a private list you cannot access.",
};
type ReqQuery = { Querystring: OfficialLocationListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<OfficialLocationList>>) {
  return res.send(await fetchOfficialLocationPage(req, req.query));
}

const getOfficialLocations: Route<ReqQuery, OfficialLocationList> = {
  url: "/official/locations",
  method: "GET",
  config: { permissions: ["read:official_permits"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getOfficialLocations;
