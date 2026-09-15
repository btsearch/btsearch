import { analyzerUsage } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { and, asc, gte, lte } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import z from "zod";

import redis from "../../../../../database/redis.ts";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.ts";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.ts";

const CACHE_TTL = 86400;

const schemaRoute = {
  querystring: z.object({
    from: z.coerce.date().optional().default(new Date(0)),
    to: z.coerce.date().optional().default(new Date()),
    granularity: z.enum(["daily", "monthly"]).default("daily"),
  }),
  response: {
    200: z.object({
      data: z.array(
        z.object({
          date: z.string(),
          count: z.number(),
        }),
      ),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResBody = z.infer<typeof schemaRoute.response>;

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResBody>>) {
  const { from, to, granularity } = req.query;
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const cacheKey = `stats:analyzer:usage:${granularity}:${fromIso}:${toIso}`;
  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached));

  const fromDay = fromIso.slice(0, 10),
    toDay = toIso.slice(0, 10);
  const rows = await db
    .select()
    .from(analyzerUsage)
    .where(and(gte(analyzerUsage.date, fromDay), lte(analyzerUsage.date, toDay)))
    .orderBy(asc(analyzerUsage.date));

  const map = new Map<string, number>();
  for (const row of rows) {
    const key = granularity === "monthly" ? row.date.slice(0, 7) : row.date;
    const getKey = map.get(key) ?? 0;
    map.set(key, getKey + row.count);
  }
  const data = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));
  const response = { data };
  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
  return res.send(response);
}

const getAnalyzerUsage: Route<ReqQuery, ResBody> = {
  url: "/stats/analyzer/usage",
  method: "GET",
  schema: schemaRoute,
  config: {
    permissions: ["read:stats"],
    allowGuestAccess: true,
  },
  handler,
};

export default getAnalyzerUsage;
