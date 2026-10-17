import { countryStatisticsSchema, statisticsQuerySchema } from "@openbts/shared/contract";
import type { CountryStatistics, StatisticsQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { loadOfficialVisibility } from "../../../../features/official/visibility.js";
import { emptyCountryStatistics, loadCountryStatistics, loadOfficialStatistics } from "../../../../features/stats/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get current totals per country",
  description:
    "Countries are sorted by code, and a country without data comes back with zeros. " +
    "In `official`, locations and permits count in the country the location is in, microwave links in the country of their source. " +
    "The numbers are cached for 10 minutes.",
  querystring: statisticsQuerySchema,
  response: {
    200: z.object({
      data: z.array(countryStatisticsSchema),
    }),
  },
};
type ReqQuery = { Querystring: StatisticsQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<CountryStatistics[]>>) {
  const countryCodes = await loadVisibleCountryCodes(req, req.query.countryCodes);
  if (countryCodes.length === 0) return res.send({ data: [] });

  const [countries, official] = await Promise.all([loadCountryStatistics(), loadOfficialVisibility(req).then(loadOfficialStatistics)]);
  const statistics = new Map(countries.map((country) => [country.countryCode, country]));
  const data = countryCodes.toSorted().map((countryCode) => ({
    ...(statistics.get(countryCode) ?? emptyCountryStatistics(countryCode)),
    official: official.get(countryCode) ?? null,
  }));

  return res.send({ data });
}

const getStatistics: Route<ReqQuery, CountryStatistics[]> = {
  url: "/statistics",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStatistics;
