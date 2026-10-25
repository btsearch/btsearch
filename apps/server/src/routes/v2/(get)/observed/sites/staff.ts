import { observedSiteListQuerySchema, observedSiteListSchema } from "@openbts/shared/contract";
import type { ObservedSiteList, ObservedSiteListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { accessFromRequest } from "../../../../../features/access/access.js";
import { assertModeratesObservations, assertObservationsOn } from "../../../../../features/observed/access.js";
import { resolveObservedCellFilters } from "../../../../../features/observed/filters.js";
import { listObservedSites } from "../../../../../features/observed/sites/list.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqQuery = { Querystring: ObservedSiteListQuery };

const schemaRoute = {
  summary: "List estimated sites for editors",
  description:
    "Every estimated site with a position, public or not. Editors get the sites inside their grants, administrators every site. " +
    "Copies of a site observed under another network are left out unless you ask with `includeCopies=true`, and replaced sites are never listed.",
  querystring: observedSiteListQuerySchema,
  response: {
    200: observedSiteListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid, or `limit` is above 200 with `include`.",
  403: "Observed data is switched off and you are not an administrator.",
};

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ObservedSiteList>>) {
  res.header("Cache-Control", "private, no-store");
  await assertObservationsOn(req);
  await assertModeratesObservations(req);

  const [access, filters] = await Promise.all([accessFromRequest(req), resolveObservedCellFilters(req.query)]);
  return res.send(await listObservedSites(req.query, filters, { kind: "staff", access }));
}

const getStaffObservedSites: Route<ReqQuery, ObservedSiteList> = {
  url: "/observed/sites/staff",
  method: "GET",
  config: { permissions: ["read:observations"], permissionsCheckedByHandler: ["moderate:observations"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getStaffObservedSites;
