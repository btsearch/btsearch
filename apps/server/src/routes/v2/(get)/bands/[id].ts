import { bandParamsSchema, bandSchema } from "@openbts/shared/contract";
import type { Band } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { toBand } from "../../../../features/bands/serialize.js";
import { isUnknownBand } from "../../../../features/bands/unknown.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a band",
  params: bandParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: bandSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof bandParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Band>>) {
  const band = await db.query.bands.findFirst({ where: { id: req.params.id } });
  if (!band || isUnknownBand(band)) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: toBand(band) });
}

const getBand: Route<ReqParams, Band> = {
  url: "/bands/:id",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons: { 404: "The band does not exist." } },
  schema: schemaRoute,
  handler,
};

export default getBand;
