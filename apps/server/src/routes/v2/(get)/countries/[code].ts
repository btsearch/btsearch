import { countryParamsSchema, countrySchema } from "@openbts/shared/contract";
import type { Country } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { canSeeCountry } from "../../../../features/access/access.js";
import { sessionOrTokenAccessFromRequest } from "../../../../features/access/staff.js";
import { toCountry } from "../../../../features/countries/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a country",
  description:
    "Returns a country by its code. " +
    "A hidden country (`isVisible` is `false`) is only returned to administrators and to editors with a grant in that country.",
  params: countryParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: countrySchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof countryParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Country>>) {
  const { code } = req.params;

  const country = await db.query.countries.findFirst({ where: { code } });
  if (!country) throw new ErrorResponse("NOT_FOUND");
  if (!country.isVisible && !canSeeCountry(await sessionOrTokenAccessFromRequest(req), code)) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: toCountry(country) });
}

const getCountry: Route<ReqParams, Country> = {
  url: "/countries/:code",
  method: "GET",
  config: {
    allowGuestAccess: true,
    errorReasons: { 404: "The country does not exist, or it is hidden and you cannot access it." },
  },
  schema: schemaRoute,
  handler,
};

export default getCountry;
