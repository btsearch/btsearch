import { bands, cells, operators, stations, ukePermits, ukeStations } from "@openbts/drizzle";
import { count, countDistinct, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import redis from "../../../../database/redis.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { type StatsOperator, statsOperatorSchema } from "../../../../services/stats/schemas.js";

const CACHE_TTL = 86400; // 24h

const internalSchema = z.object({
  total_stations: z.number(),
  total_cells: z.number(),
  by_rat: z.array(
    z.object({
      rat: z.string(),
      stations: z.number(),
      cells: z.number(),
      share_pct: z.number(),
    }),
  ),
  by_operator: z.array(
    z.object({
      operator: statsOperatorSchema,
      stations: z.number(),
      cells: z.number(),
    }),
  ),
});

const schemaRoute = {
  querystring: z.object({
    operator_id: z.coerce.number().int().optional(),
  }),
  response: {
    200: z.object({
      data: z.object({
        total_permits: z.number(),
        total_unique_stations: z.number(),
        by_rat: z.array(
          z.object({
            rat: z.string(),
            unique_stations: z.number(),
            permits: z.number(),
            share_pct: z.number(),
          }),
        ),
        by_operator: z.array(
          z.object({
            operator: statsOperatorSchema,
            unique_stations: z.number(),
            permits: z.number(),
          }),
        ),
        internal: internalSchema,
      }),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };

interface InternalSummary {
  total_stations: number;
  total_cells: number;
  by_rat: { rat: string; stations: number; cells: number; share_pct: number }[];
  by_operator: { operator: StatsOperator; stations: number; cells: number }[];
}

interface Response {
  total_permits: number;
  total_unique_stations: number;
  by_rat: { rat: string; unique_stations: number; permits: number; share_pct: number }[];
  by_operator: { operator: StatsOperator; unique_stations: number; permits: number }[];
  internal: InternalSummary;
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<Response>>) {
  const { operator_id } = req.query;
  const cacheKey = `stats:summary:v2${operator_id ? `:op:${operator_id}` : ""}`;

  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached));

  const ukeWhere = operator_id ? eq(ukeStations.operator_id, operator_id) : undefined;
  const stationWhere = operator_id ? eq(stations.operator_id, operator_id) : undefined;

  const [byRatRows, byOperatorRows, ukeTotals, internalByRat, internalByOperator, internalTotals] = await Promise.all([
    db
      .select({
        rat: bands.rat,
        unique_stations: countDistinct(ukePermits.uke_station_id),
        permits: count(),
      })
      .from(ukePermits)
      .innerJoin(ukeStations, eq(ukePermits.uke_station_id, ukeStations.id))
      .innerJoin(bands, eq(ukePermits.band_id, bands.id))
      .where(ukeWhere)
      .groupBy(bands.rat),

    db
      .select({
        operator_id: operators.id,
        operator_name: operators.name,
        operator_mnc: operators.mnc,
        unique_stations: countDistinct(ukePermits.uke_station_id),
        permits: count(),
      })
      .from(ukePermits)
      .innerJoin(ukeStations, eq(ukePermits.uke_station_id, ukeStations.id))
      .innerJoin(operators, eq(ukeStations.operator_id, operators.id))
      .where(ukeWhere)
      .groupBy(operators.id, operators.name, operators.mnc),

    db
      .select({
        total_unique_stations: countDistinct(ukePermits.uke_station_id),
        total_permits: count(),
      })
      .from(ukePermits)
      .innerJoin(ukeStations, eq(ukePermits.uke_station_id, ukeStations.id))
      .where(ukeWhere),

    db
      .select({
        rat: cells.rat,
        stations: countDistinct(cells.station_id),
        cells: count(),
      })
      .from(cells)
      .innerJoin(stations, eq(cells.station_id, stations.id))
      .where(stationWhere)
      .groupBy(cells.rat),

    db
      .select({
        operator_id: operators.id,
        operator_name: operators.name,
        operator_mnc: operators.mnc,
        stations: countDistinct(cells.station_id),
        cells: count(),
      })
      .from(cells)
      .innerJoin(stations, eq(cells.station_id, stations.id))
      .innerJoin(operators, eq(stations.operator_id, operators.id))
      .where(stationWhere)
      .groupBy(operators.id, operators.name, operators.mnc),

    db
      .select({
        total_stations: countDistinct(cells.station_id),
        total_cells: count(),
      })
      .from(cells)
      .innerJoin(stations, eq(cells.station_id, stations.id))
      .where(stationWhere),
  ]);

  const totalUniqueStations = ukeTotals[0]?.total_unique_stations ?? 0;
  const totalPermits = ukeTotals[0]?.total_permits ?? 0;

  const totalInternalStations = internalTotals[0]?.total_stations ?? 0;
  const totalInternalCells = internalTotals[0]?.total_cells ?? 0;

  const response = {
    data: {
      total_permits: totalPermits,
      total_unique_stations: totalUniqueStations,
      by_rat: byRatRows.map((r) => ({
        rat: r.rat,
        unique_stations: r.unique_stations,
        permits: r.permits,
        share_pct: totalUniqueStations > 0 ? Math.round((r.unique_stations / totalUniqueStations) * 1000) / 10 : 0,
      })),
      by_operator: byOperatorRows.map((r) => ({
        operator: { id: r.operator_id, name: r.operator_name, mnc: r.operator_mnc },
        unique_stations: r.unique_stations,
        permits: r.permits,
      })),
      internal: {
        total_stations: totalInternalStations,
        total_cells: totalInternalCells,
        by_rat: internalByRat.map((r) => ({
          rat: r.rat,
          stations: r.stations,
          cells: r.cells,
          share_pct: totalInternalStations > 0 ? Math.round((r.stations / totalInternalStations) * 1000) / 10 : 0,
        })),
        by_operator: internalByOperator.map((r) => ({
          operator: { id: r.operator_id, name: r.operator_name, mnc: r.operator_mnc },
          stations: r.stations,
          cells: r.cells,
        })),
      },
    },
  };

  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
  res.send(response);
}

const getStatsSummary: Route<ReqQuery, Response> = {
  url: "/stats/summary",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  handler,
};

export default getStatsSummary;
