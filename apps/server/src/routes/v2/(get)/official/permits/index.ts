import { officialPermitListQuerySchema, officialPermitListSchema } from "@openbts/shared/contract";
import type { OfficialPermitList, OfficialPermitListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchOfficialPermitPage } from "../../../../../features/official/permits.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List official permits",
  querystring: officialPermitListQuerySchema,
  response: {
    200: officialPermitListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
  403: "You sent `isLinked=false` without the `read_unassigned:official_permits` permission.",
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
