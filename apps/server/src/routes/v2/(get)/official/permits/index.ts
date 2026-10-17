import { officialPermitListQuerySchema, officialPermitListSchema } from "@openbts/shared/contract";
import type { OfficialPermitList, OfficialPermitListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchOfficialPermitPage } from "../../../../../features/official/permits.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List official permits",
  description:
    "Returns the permits of the official registers, one page at a time. Each permit belongs to one official site.\n\n" +
    "To get the permits of a station in this database, send `stationIds`. A station in a country you cannot access matches nothing, " +
    "so you get an empty list rather than an error. `include=stations` adds the stations each permit is linked to.\n\n" +
    "`isLinked=false` returns the permits that are not linked to any station yet. " +
    "It needs the `read_unassigned:official_permits` permission, which only editors and administrators have.\n\n" +
    "Permits of a hidden source and permits in countries you cannot access are left out.",
  querystring: officialPermitListQuerySchema,
  response: {
    200: officialPermitListSchema,
  },
};
const errorReasons = {
  400: "A query parameter did not pass validation, or the `cursor` is invalid. A cursor only works with the `sort` it was returned for.",
  403:
    "You sent `isLinked=false` without the `read_unassigned:official_permits` permission. " +
    "Also returned when your API key or token cannot be used for this endpoint, two-factor authentication still has to be set up, " +
    "or the endpoint is disabled.",
};
type ReqQuery = { Querystring: OfficialPermitListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<OfficialPermitList>>) {
  return res.send(await fetchOfficialPermitPage(req, req.query));
}

const getOfficialPermits: Route<ReqQuery, OfficialPermitList> = {
  url: "/official/permits",
  method: "GET",
  config: { permissions: ["read:official_permits"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getOfficialPermits;
