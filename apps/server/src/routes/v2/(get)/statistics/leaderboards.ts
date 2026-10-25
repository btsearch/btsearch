import { contributorLeaderboardQuerySchema, contributorLeaderboardSchema } from "@openbts/shared/contract";
import type { ContributorLeaderboard, ContributorLeaderboardQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertPublicObservationsOn } from "../../../../features/observed/access.js";
import { loadLeaderboards } from "../../../../features/stats/leaderboards.js";
import { loadObservationCountryCodes } from "../../../../features/stats/observations.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get the leaderboards of contributors",
  description:
    "Per country, the people who chose to be listed and have a public profile, ranked by the squares they were the first to measure on a network, " +
    "for all time or for one month. " +
    "New confirmed cells and new sites are counted beside them. " +
    "The boards are worked out once a day, and who is shown on them is checked when you ask.",
  querystring: contributorLeaderboardQuerySchema,
  response: {
    200: z.object({
      data: z.array(contributorLeaderboardSchema),
    }),
  },
};
const errorReasons = {
  400: "`startsOn` is not the first day of a month.",
  403: "Observed data is switched off.",
};
type ReqQuery = { Querystring: ContributorLeaderboardQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ContributorLeaderboard[]>>) {
  assertPublicObservationsOn();
  const startsOn = req.query.startsOn ?? null;
  const countryCodes = await loadObservationCountryCodes(req.query.countryCodes);
  const boards = await loadLeaderboards(countryCodes, startsOn, req.query.limit);

  return res.send({
    data: countryCodes.map((countryCode) => ({ countryCode, startsOn, ...(boards.get(countryCode) ?? { refreshedOn: null, entries: [] }) })),
  });
}

const getLeaderboards: Route<ReqQuery, ContributorLeaderboard[]> = {
  url: "/statistics/leaderboards",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getLeaderboards;
