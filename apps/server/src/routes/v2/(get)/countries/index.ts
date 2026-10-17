import { countrySchema } from "@openbts/shared/contract";
import type { Country } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { canSeeCountry } from "../../../../features/access/access.js";
import { sessionOrTokenAccessFromRequest } from "../../../../features/access/staff.js";
import { toCountry } from "../../../../features/countries/serialize.js";
import { loadSourceCapabilities } from "../../../../features/official/capabilities.js";
import { loadOfficialVisibility } from "../../../../features/official/visibility.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List countries",
  description:
    "Countries are ordered by code. " +
    "`capabilities.official` and `capabilities.microwaveLinks` depend on the official sources you can see, " +
    "so for administrators they also count sources that are still hidden.",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: z.array(countrySchema),
    }),
  },
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<Country[]>>) {
  const [rows, sourceCapabilities] = await Promise.all([
    db.query.countries.findMany({ orderBy: { code: "asc" } }),
    loadOfficialVisibility(req).then(loadSourceCapabilities),
  ]);
  const access = rows.every((row) => row.isVisible) ? null : await sessionOrTokenAccessFromRequest(req);
  const visible = rows.filter((row) => row.isVisible || canSeeCountry(access, row.code));

  return res.send({ data: visible.map((row) => toCountry(row, sourceCapabilities)) });
}

const getCountries: Route<RouteGenericInterface, Country[]> = {
  url: "/countries",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getCountries;
