import { officialSiteListQuerySchema, officialSiteListSchema } from "@openbts/shared/contract";
import type { OfficialSiteList, OfficialSiteListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchOfficialSitePage } from "../../../../../features/official/sites.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List official sites",
  description:
    "A site is what a register lists for one operator, or one licensee, at one location, and it holds the permits issued for it.\n\n" +
    "Sorting by `relevance` pages by position, so you can page through roughly 100000 results, after which `nextCursor` is `null`.",
  querystring: officialSiteListQuerySchema,
  response: {
    200: officialSiteListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
  403: "Lists are disabled and you sent `listId`.",
  404: "The list in `listId` does not exist, or it is a private list you cannot access.",
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
