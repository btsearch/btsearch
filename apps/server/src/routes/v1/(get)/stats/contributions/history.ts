import { contributionSnapshots } from "@openbts/drizzle";
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
    granularity: z.enum(["daily", "monthly"]).default("monthly"),
  }),
  response: {
    200: z.object({
      data: z.array(
        z.object({
          date: z.string(),
          totalSectors: z.number(),
          totalExtraIds: z.number(),
          totalCellsWithPCI: z.number(),
          addedSectors: z.number(),
          addedExtraIds: z.number(),
          addedCellsWithPCI: z.number(),
        }),
      ),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResBody = z.infer<(typeof schemaRoute.response)["200"]>;

function bucketKey(date: Date, granularity: "daily" | "monthly"): string {
  const isoDate = date.toISOString();
  return granularity === "monthly" ? isoDate.slice(0, 7) : isoDate.slice(0, 10);
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResBody>>) {
  const { from, to, granularity } = req.query;
  const cacheKey = `stats:contributions:history:v2:${granularity}:${from.toISOString()}:${to.toISOString()}`;
  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached));

  const rows = await db
    .select()
    .from(contributionSnapshots)
    .where(and(gte(contributionSnapshots.snapshot_date, from), lte(contributionSnapshots.snapshot_date, to)))
    .orderBy(asc(contributionSnapshots.snapshot_date));

  const byBucket = new Map<string, (typeof rows)[number]>();
  for (const row of rows) byBucket.set(bucketKey(row.snapshot_date, granularity), row);
  const buckets = [...byBucket.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const data = buckets.map(([date, cur], i) => {
    const prev = i > 0 ? buckets[i - 1]![1] : undefined;
    return {
      date,
      totalSectors: cur.totalSectors,
      totalExtraIds: cur.totalExtraIds,
      totalCellsWithPCI: cur.totalCellsWithPCI,
      addedSectors: prev ? cur.totalSectors - prev.totalSectors : 0,
      addedExtraIds: prev ? cur.totalExtraIds - prev.totalExtraIds : 0,
      addedCellsWithPCI: prev ? cur.totalCellsWithPCI - prev.totalCellsWithPCI : 0,
    };
  });

  const response = { data };
  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
  return res.send(response);
}

const getContributionsHistory: Route<ReqQuery, ResBody> = {
  url: "/stats/contributions/history",
  method: "GET",
  schema: schemaRoute,
  config: {
    permissions: ["read:stats"],
    allowGuestAccess: true,
  },
  handler,
};

export default getContributionsHistory;
