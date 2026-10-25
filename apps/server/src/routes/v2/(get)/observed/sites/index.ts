import { observedSiteListQuerySchema, observedSiteListSchema } from "@openbts/shared/contract";
import type { ObservedSiteList, ObservedSiteListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { assertPublicObservationsOn } from "../../../../../features/observed/access.js";
import { resolveObservedCellFilters } from "../../../../../features/observed/filters.js";
import { PUBLIC_SITES_CACHE_CONTROL, listObservedSites } from "../../../../../features/observed/sites/list.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqQuery = { Querystring: ObservedSiteListQuery };

const schemaRoute = {
  summary: "List public estimated sites",
  description:
    "The sites the engine estimated from what phones measured, one row per site with a position, as everyone sees them. " +
    "Copies of a site observed under another network are left out unless you ask with `includeCopies=true`, and replaced sites are never listed. " +
    "The answer is the same for everyone and comes from a cache, so it can be up to five minutes old, " +
    "and your browser may show one up to an hour older while it fetches a new one. " +
    "Your own sites that are not public yet are at `GET /observed/sites/mine`, and editors get theirs at `GET /observed/sites/staff`.",
  querystring: observedSiteListQuerySchema,
  response: {
    200: observedSiteListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid, or `limit` is above 200 with `include`.",
  403: "Observed data is switched off.",
};

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ObservedSiteList>>) {
  assertPublicObservationsOn();

  const filters = await resolveObservedCellFilters(req.query);
  const list = await listObservedSites(req.query, filters, { kind: "public" });

  res.header("Cache-Control", PUBLIC_SITES_CACHE_CONTROL);
  return res.send(list);
}

const getObservedSites: Route<ReqQuery, ObservedSiteList> = {
  url: "/observed/sites",
  method: "GET",
  config: { permissions: ["read:observations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservedSites;
