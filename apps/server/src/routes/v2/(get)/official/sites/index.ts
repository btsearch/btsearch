import { officialSiteListQuerySchema, officialSiteListSchema } from "@openbts/shared/contract";
import type { OfficialSiteList, OfficialSiteListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchOfficialSitePage } from "../../../../../features/official/sites.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List official sites",
  description:
    "Returns the sites of the official registers, one page at a time. " +
    "A site is what a register lists for one operator, or one licensee, at one location, and it holds the permits issued for it.\n\n" +
    "`rats` and `bandLabels` select the sites that have a matching permit. " +
    "With `include=permits`, each site comes with its permits, and when you send `rats` or `bandLabels`, only with the permits that match.\n\n" +
    "`q` searches the site ids, the permit numbers and the places. With `q`, the best matches come first unless you send another `sort`. " +
    "Sorting by `relevance` pages by position, so you can page through roughly 100000 results, after which `nextCursor` is `null`.\n\n" +
    "`stationIds` finds the sites linked to stations in this database. " +
    "Each site's `stationIds` says which stations it is linked to.\n\n" +
    "Sites of a hidden source and sites in countries you cannot access are left out.",
  querystring: officialSiteListQuerySchema,
  response: {
    200: officialSiteListSchema,
  },
};
const errorReasons = {
  400: "A query parameter did not pass validation, or the `cursor` is invalid. A cursor only works with the `sort` it was returned for.",
  403:
    "Lists are disabled and you sent `listId`. Also returned when your API key or token cannot be used for this endpoint, " +
    "two-factor authentication still has to be set up, or the endpoint is disabled.",
  404: "Only returned when you send `listId`. The list does not exist, or it is a private list you cannot access.",
};
type ReqQuery = { Querystring: OfficialSiteListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<OfficialSiteList>>) {
  return res.send(await fetchOfficialSitePage(req, req.query));
}

const getOfficialSites: Route<ReqQuery, OfficialSiteList> = {
  url: "/official/sites",
  method: "GET",
  config: { permissions: ["read:official_permits"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getOfficialSites;
