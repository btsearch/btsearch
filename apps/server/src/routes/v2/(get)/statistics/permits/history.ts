import { permitHistoryPointSchema, permitHistoryQuerySchema } from "@openbts/shared/contract";
import type { PermitHistoryPoint, PermitHistoryQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../../features/countries/visibility.js";
import { loadSourceCapabilities } from "../../../../../features/official/capabilities.js";
import { loadOfficialVisibility } from "../../../../../features/official/visibility.js";
import { loadPermitHistory } from "../../../../../features/stats/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get historical permit totals per country",
  description:
    "A snapshot is taken after each import that applies new official sites and permits, and the last one of a day replaces the earlier ones. " +
    "Points are sorted by country and then by day.\n\n" +
    "A site with permits on several bands is counted once per band, so with `label` the `sites` do not add up to the total. " +
    "To compare a month with the month before, ask for both with `interval=month` and read `added` on the later one.\n\n" +
    "Countries without an official source with sites that you can see are left out.",
  querystring: permitHistoryQuerySchema,
  response: {
    200: z.object({
      data: z.array(permitHistoryPointSchema),
    }),
  },
};
type ReqQuery = { Querystring: PermitHistoryQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<PermitHistoryPoint[]>>) {
  const [countryCodes, capabilities] = await Promise.all([
    loadVisibleCountryCodes(req, req.query.countryCodes),
    loadOfficialVisibility(req).then(loadSourceCapabilities),
  ]);
  const countryCodesWithSites = countryCodes.filter((countryCode) => capabilities.get(countryCode)?.official === true);

  return res.send({ data: await loadPermitHistory(countryCodesWithSites, req.query) });
}

const getPermitHistory: Route<ReqQuery, PermitHistoryPoint[]> = {
  url: "/statistics/permits/history",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getPermitHistory;
