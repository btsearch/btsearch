import { officialPermitParamsSchema, officialPermitQuerySchema, officialPermitSchema } from "@openbts/shared/contract";
import type { OfficialPermit, OfficialPermitQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { readOfficialPermit } from "../../../../../features/official/permits.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an official permit",
  params: officialPermitParamsSchema,
  querystring: officialPermitQuerySchema,
  response: {
    200: z.object({
      data: officialPermitSchema,
    }),
  },
};
type RequestData = { Params: z.infer<typeof officialPermitParamsSchema>; Querystring: OfficialPermitQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<OfficialPermit>>) {
  return res.send({ data: await readOfficialPermit(req, req.params.id, req.query.include ?? []) });
}

const getOfficialPermit: Route<RequestData, OfficialPermit> = {
  url: "/official/permits/:id",
  method: "GET",
  config: { permissions: ["read:official_permits"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getOfficialPermit;
