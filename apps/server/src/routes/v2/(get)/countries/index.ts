import { countrySchema } from "@openbts/shared/contract";
import type { Country } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { canSeeCountry } from "../../../../features/access/access.js";
import { sessionOrTokenAccessFromRequest } from "../../../../features/access/staff.js";
import { toCountry } from "../../../../features/countries/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List countries",
  description:
    "Returns all countries, ordered by code. " +
    "Hidden countries (`isVisible` is `false`) are only included for administrators and for editors with a grant in that country. " +
    "`contributions` is a separate setting, and a country does not accept submissions while it is `closed`.",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: z.array(countrySchema),
    }),
  },
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<Country[]>>) {
  const rows = await db.query.countries.findMany({ orderBy: { code: "asc" } });
  const access = rows.every((row) => row.isVisible) ? null : await sessionOrTokenAccessFromRequest(req);
  const visible = rows.filter((row) => row.isVisible || canSeeCountry(access, row.code));

  return res.send({ data: visible.map(toCountry) });
}

const getCountries: Route<RouteGenericInterface, Country[]> = {
  url: "/countries",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getCountries;
