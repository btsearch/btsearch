import { statisticsHistoryPointSchema, statisticsHistoryQuerySchema } from "@openbts/shared/contract";
import type { StatisticsHistoryPoint, StatisticsHistoryQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { loadStatisticsHistory } from "../../../../features/stats/countries.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get historical totals per country",
  description:
    "Returns how the totals of each country changed over time, sorted by country and then by day. " +
    "A snapshot is taken once a day. With `interval=month` (the default) you get the last snapshot of each month, " +
    "and with `interval=day` all of them. `takenAfter` and `takenBefore` are both inclusive. " +
    "Snapshots count stations of every status along with their cells, sectors and identifiers, " +
    "so the numbers can be higher than the active counts in the other statistics. " +
    "`cellsWithPci` only counts LTE and NR cells. Countries you cannot access are left out.",
  querystring: statisticsHistoryQuerySchema,
  response: {
    200: z.object({
      data: z.array(statisticsHistoryPointSchema),
    }),
  },
};
type ReqQuery = { Querystring: StatisticsHistoryQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<StatisticsHistoryPoint[]>>) {
  const countryCodes = await loadVisibleCountryCodes(req, req.query.countryCodes);

  return res.send({ data: await loadStatisticsHistory(countryCodes, req.query) });
}

const getStatisticsHistory: Route<ReqQuery, StatisticsHistoryPoint[]> = {
  url: "/statistics/history",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStatisticsHistory;
