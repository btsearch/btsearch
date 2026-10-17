import { analyzerUsagePointSchema, analyzerUsageQuerySchema } from "@openbts/shared/contract";
import type { AnalyzerUsagePoint, AnalyzerUsageQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadAnalyzerUsage } from "../../../../features/stats/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get log analyzer usage per day or month",
  description:
    "Points are sorted by day. Every analysis adds one to the count of its UTC day, and a call to `POST /cells/match` is one analysis. " +
    "Days and months without any use are left out. " +
    "Unlike the other statistics, this one covers the whole site and is not split by country.",
  querystring: analyzerUsageQuerySchema,
  response: {
    200: z.object({
      data: z.array(analyzerUsagePointSchema),
    }),
  },
};
type ReqQuery = { Querystring: AnalyzerUsageQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<AnalyzerUsagePoint[]>>) {
  return res.send({ data: await loadAnalyzerUsage(req.query) });
}

const getAnalyzerUsage: Route<ReqQuery, AnalyzerUsagePoint[]> = {
  url: "/statistics/analyzer-usage",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getAnalyzerUsage;
