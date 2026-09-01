import { bands, operators, statsSnapshots } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { and, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import redis from "../../../../../database/redis.ts";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.ts";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.ts";
import { statsBandSchema, statsOperatorSchema } from "../../../../../services/stats/schemas.js";

const CACHE_TTL = 86400;

const schemaRoute = {
  querystring: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
  }),
  response: {
    200: z.object({
      data: z.object({
        snapshot_date: z.string().nullable(),
        previous_snapshot_date: z.string().nullable(),
        rows: z.array(
          z.object({
            operator: statsOperatorSchema,
            band: statsBandSchema,
            unique_stations: z.number(),
            permits: z.number(),
            unique_stations_delta: z.number(),
            permits_delta: z.number(),
          }),
        ),
      }),
    }),
  },
};

type ReqBody = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResBody = z.infer<(typeof schemaRoute.response)["200"]>;

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResBody>>) {
  const { month } = req.query;
  const cacheKey = `stats:permits:snapshot:v4:${month}`;
  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached));

  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const latest = await db
    .select({ date: statsSnapshots.snapshot_date })
    .from(statsSnapshots)
    .where(and(gte(statsSnapshots.snapshot_date, start), lt(statsSnapshots.snapshot_date, end)))
    .orderBy(desc(statsSnapshots.snapshot_date))
    .limit(1);

  if (!latest[0]) {
    const response = { data: { snapshot_date: null, previous_snapshot_date: null, rows: [] } };
    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
    return res.send(response);
  }

  const prevMonthStart = new Date(start);
  prevMonthStart.setUTCMonth(prevMonthStart.getUTCMonth() - 1);

  const previous = await db
    .select({ date: statsSnapshots.snapshot_date })
    .from(statsSnapshots)
    .where(and(gte(statsSnapshots.snapshot_date, prevMonthStart), lt(statsSnapshots.snapshot_date, start)))
    .orderBy(desc(statsSnapshots.snapshot_date))
    .limit(1);

  const raw = await db
    .select({
      operator_id: operators.id,
      operator_name: operators.name,
      operator_mnc: operators.mnc,
      band_id: bands.id,
      band_name: bands.name,
      band_rat: bands.rat,
      unique_stations: statsSnapshots.unique_stations_count,
      permits: statsSnapshots.permits_count,
    })
    .from(statsSnapshots)
    .innerJoin(operators, eq(statsSnapshots.operator_id, operators.id))
    .innerJoin(bands, eq(statsSnapshots.band_id, bands.id))
    .where(and(eq(statsSnapshots.snapshot_date, latest[0].date), isNotNull(statsSnapshots.band_id)));

  const previousRows = previous[0]
    ? await db
        .select({
          operator_id: statsSnapshots.operator_id,
          band_id: statsSnapshots.band_id,
          unique_stations: statsSnapshots.unique_stations_count,
          permits: statsSnapshots.permits_count,
        })
        .from(statsSnapshots)
        .where(and(eq(statsSnapshots.snapshot_date, previous[0].date), isNotNull(statsSnapshots.band_id)))
    : [];

  const previousByKey = new Map(previousRows.map((row) => [`${row.operator_id}:${row.band_id}`, row]));

  const rows = raw.map((row) => ({
    operator: { id: row.operator_id, name: row.operator_name, mnc: row.operator_mnc },
    band: { id: row.band_id, name: row.band_name, rat: row.band_rat },
    unique_stations: row.unique_stations,
    permits: row.permits,
    unique_stations_delta: row.unique_stations - (previousByKey.get(`${row.operator_id}:${row.band_id}`)?.unique_stations ?? 0),
    permits_delta: row.permits - (previousByKey.get(`${row.operator_id}:${row.band_id}`)?.permits ?? 0),
  }));

  const response = {
    data: {
      snapshot_date: latest[0].date.toISOString(),
      previous_snapshot_date: previous[0]?.date.toISOString() ?? null,
      rows,
    },
  };
  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
  return res.send(response);
}

const getPermitsSnapshot: Route<ReqBody, ResBody> = {
  url: "/stats/permits/snapshot",
  method: "GET",
  schema: schemaRoute,
  config: {
    permissions: ["read:stats"],
  },
  handler,
};

export default getPermitsSnapshot;
