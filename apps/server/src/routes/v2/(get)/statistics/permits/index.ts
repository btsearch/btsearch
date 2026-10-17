import { permitBreakdownQuerySchema, permitBreakdownRowSchema } from "@openbts/shared/contract";
import type { PermitBreakdownQuery, PermitBreakdownRow } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../../features/countries/visibility.js";
import { loadOfficialVisibility } from "../../../../../features/official/visibility.js";
import { loadPermitBreakdown } from "../../../../../features/stats/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a breakdown of official permits per country",
  description:
    "Returns the number of permits in the official sources you can see, and of the official sites that hold them, per country. " +
    "A site counts in the country its location is in. " +
    "Add `groupBy` to split each country further by operator, region, technology (`rat`) or band (`label`). " +
    "A `label` is a technology, a frequency and a variant together, so grouping by it also fills `rat`.\n\n" +
    "The fields for dimensions you did not group by are `null`. " +
    "A site with permits in several groups is counted in each of them, so `sites` does not add up to the country total. " +
    "To get shares, divide a row's numbers by the totals from a request without that dimension.\n\n" +
    "Rows come in no particular order, and countries without permits or that you cannot access are left out. " +
    "The numbers are cached for 10 minutes.",
  querystring: permitBreakdownQuerySchema,
  response: {
    200: z.object({
      data: z.array(permitBreakdownRowSchema),
    }),
  },
};
type ReqQuery = { Querystring: PermitBreakdownQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<PermitBreakdownRow[]>>) {
  const countryCodes = new Set(await loadVisibleCountryCodes(req, req.query.countryCodes));
  if (countryCodes.size === 0) return res.send({ data: [] });

  const rows = await loadPermitBreakdown(req.query.groupBy ?? [], await loadOfficialVisibility(req));

  return res.send({ data: rows.filter((row) => countryCodes.has(row.countryCode)) });
}

const getPermitStatistics: Route<ReqQuery, PermitBreakdownRow[]> = {
  url: "/statistics/permits",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getPermitStatistics;
