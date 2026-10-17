import { officialLocationListQuerySchema, officialLocationListSchema } from "@openbts/shared/contract";
import type { OfficialLocationList, OfficialLocationListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchOfficialLocationPage } from "../../../../../features/official/locations.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List official locations",
  description:
    "Returns the locations of the official registers, one page at a time. " +
    "A location holds the official sites at that place, and each site holds the permits issued for it.\n\n" +
    "The site filters (`operatorIds`, `rats`, `bandLabels`, `createdAfter`, `updatedAfter`, `changedAfter` and `listId`) select sites, " +
    "and a location is only returned if at least one of its sites matches. " +
    "With `include=sites`, each location comes with only the sites that matched. " +
    "With `include=sites.permits`, each site also comes with its permits, and when you filter by `rats` or `bandLabels`, " +
    "only with the permits that match.\n\n" +
    "`operatorIds` normally filters every country. Send `keepOtherCountries=true` to filter only the countries its operators belong to, " +
    "so you can filter one country by operator without hiding the other countries on a map.\n\n" +
    "Locations of a hidden source and locations in countries you cannot access are left out.",
  querystring: officialLocationListQuerySchema,
  response: {
    200: officialLocationListSchema,
  },
};
const errorReasons = {
  400: "A query parameter did not pass validation, or the `cursor` is invalid. A cursor only works with the `sort` it was returned for.",
  403:
    "Lists are disabled and you sent `listId`. Also returned when your API key or token cannot be used for this endpoint, " +
    "two-factor authentication still has to be set up, or the endpoint is disabled.",
  404: "Only returned when you send `listId`. The list does not exist, or it is a private list you cannot access.",
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
