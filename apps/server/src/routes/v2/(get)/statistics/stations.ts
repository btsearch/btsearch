import { stationBreakdownQuerySchema, stationBreakdownRowSchema } from "@openbts/shared/contract";
import type { StationBreakdownQuery, StationBreakdownRow } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { loadStationBreakdown } from "../../../../features/stats/countries.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a breakdown of active stations and cells per country",
  description:
    "Returns the number of active stations and their cells per country. " +
    "Add `groupBy` to split each country further by region, operator, technology (`rat`) or band.\n\n" +
    "The fields for dimensions you did not group by are `null`. " +
    "When you group by `rat` or `band`, stations without cells are left out and a station is counted in every group it has cells in, " +
    "so `stations` does not add up to the country total. " +
    "Within a grouping, `null` means unknown, for example cells on an unknown band or stations without a location or an operator.\n\n" +
    "Rows come in no particular order, and countries without active stations or that you cannot access are left out. " +
    "The numbers are cached for 10 minutes.",
  querystring: stationBreakdownQuerySchema,
  response: {
    200: z.object({
      data: z.array(stationBreakdownRowSchema),
    }),
  },
};
type ReqQuery = { Querystring: StationBreakdownQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<StationBreakdownRow[]>>) {
  const countryCodes = new Set(await loadVisibleCountryCodes(req, req.query.countryCodes));
  if (countryCodes.size === 0) return res.send({ data: [] });

  const rows = await loadStationBreakdown(req.query.groupBy ?? []);

  return res.send({ data: rows.filter((row) => countryCodes.has(row.countryCode)) });
}

const getStationStatistics: Route<ReqQuery, StationBreakdownRow[]> = {
  url: "/statistics/stations",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStationStatistics;
