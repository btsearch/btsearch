import { regionParamsSchema, regionSchema } from "@openbts/shared/contract";
import type { Region } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { assertCountryVisible } from "../../../../features/countries/visibility.js";
import { toRegion } from "../../../../features/regions/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a region",
  params: regionParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: regionSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof regionParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Region>>) {
  const region = await db.query.regions.findFirst({ where: { id: req.params.id } });
  if (!region) throw new ErrorResponse("NOT_FOUND");
  await assertCountryVisible(req, region.countryCode);

  return res.send({ data: toRegion(region) });
}

const getRegion: Route<ReqParams, Region> = {
  url: "/regions/:id",
  method: "GET",
  config: {
    allowGuestAccess: true,
    errorReasons: { 404: "The region does not exist, or it is in a country you cannot access." },
  },
  schema: schemaRoute,
  handler,
};

export default getRegion;
