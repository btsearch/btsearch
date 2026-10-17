import { officialPermitParamsSchema, officialPermitQuerySchema, officialPermitSchema } from "@openbts/shared/contract";
import type { OfficialPermit, OfficialPermitQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { readOfficialPermit } from "../../../../../features/official/permits.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an official permit",
  description:
    "Returns a single permit of an official register, whether or not it is linked to a station. " +
    "Add `include=stations` to see which stations in this database it is linked to, " +
    "and `include=officialSite,officialSite.location` for its site and where it is.",
  params: officialPermitParamsSchema,
  querystring: officialPermitQuerySchema,
  response: {
    200: z.object({
      data: officialPermitSchema,
    }),
  },
};
const errorReasons = {
  404: "The permit does not exist, its source is hidden, or it is in a country you cannot access.",
};
type RequestData = { Params: z.infer<typeof officialPermitParamsSchema>; Querystring: OfficialPermitQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<OfficialPermit>>) {
  return res.send({ data: await readOfficialPermit(req, req.params.id, req.query.include ?? []) });
}

const getOfficialPermit: Route<RequestData, OfficialPermit> = {
  url: "/official/permits/:id",
  method: "GET",
  config: { permissions: ["read:official_permits"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getOfficialPermit;
