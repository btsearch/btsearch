import { officialSiteParamsSchema, officialSiteQuerySchema, officialSiteSchema } from "@openbts/shared/contract";
import type { OfficialSite, OfficialSiteQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { readOfficialSite } from "../../../../../features/official/sites.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an official site",
  description:
    "Returns a single site of an official register. `stationIds` lists the stations in this database that are linked to its permits. " +
    "Add `include=location,permits` to get its location and every permit it holds.",
  params: officialSiteParamsSchema,
  querystring: officialSiteQuerySchema,
  response: {
    200: z.object({
      data: officialSiteSchema,
    }),
  },
};
const errorReasons = {
  404: "The site does not exist, its source is hidden, or it is in a country you cannot access.",
};
type RequestData = { Params: z.infer<typeof officialSiteParamsSchema>; Querystring: OfficialSiteQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<OfficialSite>>) {
  return res.send({ data: await readOfficialSite(req, req.params.id, req.query.include ?? []) });
}

const getOfficialSite: Route<RequestData, OfficialSite> = {
  url: "/official/sites/:id",
  method: "GET",
  config: { permissions: ["read:official_permits"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getOfficialSite;
