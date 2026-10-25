import { observationStatisticsSchema, statisticsQuerySchema } from "@openbts/shared/contract";
import type { ObservationStatistics, StatisticsQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertPublicObservationsOn } from "../../../../features/observed/access.js";
import {
  emptyObservationStatistics,
  lastMonths,
  loadObservationCountryCodes,
  loadObservationStatistics,
} from "../../../../features/stats/observations.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get measurement totals per country",
  description:
    "Countries whose measurements are public, sorted by code. " +
    "Sites, cells and squares count in the country of their network, the months in the country the samples were taken in. " +
    "The numbers are worked out once an hour.",
  querystring: statisticsQuerySchema,
  response: {
    200: z.object({
      data: z.array(observationStatisticsSchema),
    }),
  },
};
const errorReasons = { 403: "Observed data is switched off." };
type ReqQuery = { Querystring: StatisticsQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ObservationStatistics[]>>) {
  assertPublicObservationsOn();
  const [countryCodes, statistics] = await Promise.all([loadObservationCountryCodes(req.query.countryCodes), loadObservationStatistics()]);

  const byCountry = new Map(statistics.map((country) => [country.countryCode, country]));
  const months = lastMonths(new Date());
  return res.send({ data: countryCodes.map((countryCode) => byCountry.get(countryCode) ?? emptyObservationStatistics(countryCode, months)) });
}

const getObservationStatistics: Route<ReqQuery, ObservationStatistics[]> = {
  url: "/statistics/observations",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservationStatistics;
