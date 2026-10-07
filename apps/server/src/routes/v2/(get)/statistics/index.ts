import { countryStatisticsSchema, statisticsQuerySchema } from "@openbts/shared/contract";
import type { CountryStatistics, StatisticsQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { emptyCountryStatistics, loadCountryStatistics } from "../../../../features/stats/countries.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get current totals per country",
  description:
    "Returns the current totals of each country, sorted by country code. " +
    "You get every country you can access, or only those in `countryCodes`, and a country without data comes back with zeros. " +
    "`stations` is split by status. `cells` counts the cells of all those stations, and `locations` counts every location, " +
    "with or without stations. `updatedAt` is the last time a station in the country was updated. " +
    "The numbers are cached for 10 minutes, so a recent change may not show up yet.",
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

  const statistics = new Map((await loadCountryStatistics()).map((country) => [country.countryCode, country]));
  const data = countryCodes.toSorted().map((countryCode) => statistics.get(countryCode) ?? emptyCountryStatistics(countryCode));

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
