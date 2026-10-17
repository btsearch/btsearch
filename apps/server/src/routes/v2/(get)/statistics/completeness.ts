import { countryCompletenessSchema, statisticsQuerySchema } from "@openbts/shared/contract";
import type { CountryCompleteness, StatisticsQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { emptyCountryCompleteness, loadCountryCompleteness } from "../../../../features/stats/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get data completeness per country",
  description:
    "Covers active stations only. Countries are sorted by code, and a country without data comes back with zeros. " +
    "The numbers are cached for 10 minutes.",
  querystring: statisticsQuerySchema,
  response: {
    200: z.object({
      data: z.array(countryCompletenessSchema),
    }),
  },
};
type ReqQuery = { Querystring: StatisticsQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<CountryCompleteness[]>>) {
  const countryCodes = await loadVisibleCountryCodes(req, req.query.countryCodes);
  if (countryCodes.length === 0) return res.send({ data: [] });

  const completeness = new Map((await loadCountryCompleteness()).map((country) => [country.countryCode, country]));
  const data = countryCodes.toSorted().map((countryCode) => completeness.get(countryCode) ?? emptyCountryCompleteness(countryCode));

  return res.send({ data });
}

const getStatisticsCompleteness: Route<ReqQuery, CountryCompleteness[]> = {
  url: "/statistics/completeness",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStatisticsCompleteness;
