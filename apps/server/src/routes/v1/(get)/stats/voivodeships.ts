import { cells, locations, operators, regions, stations, ukeLocations, ukePermits, ukeStations } from "@openbts/drizzle";
import { count, countDistinct, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import redis from "../../../../database/redis.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { statsOperatorSchema } from "../../../../services/stats/schemas.js";

const CACHE_TTL = 86400; // 24h

const ukeRowSchema = z.object({
  region: z.object({ id: z.number(), name: z.string() }),
  operator: statsOperatorSchema,
  unique_stations: z.number(),
  permits: z.number(),
});

const internalRowSchema = z.object({
  region: z.object({ id: z.number(), name: z.string() }),
  operator: statsOperatorSchema,
  stations: z.number(),
  cells: z.number(),
});

const schemaRoute = {
  querystring: z.object({
    operator_id: z.coerce.number().int().optional(),
  }),
  response: {
    200: z.object({
      data: z.object({
        uke: z.array(ukeRowSchema),
        internal: z.array(internalRowSchema),
      }),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };

interface VoivodeshipResponse {
  uke: z.infer<typeof ukeRowSchema>[];
  internal: z.infer<typeof internalRowSchema>[];
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<VoivodeshipResponse>>) {
  const { operator_id } = req.query;
  const cacheKey = `stats:voivodeships:v2${operator_id ? `:op:${operator_id}` : ""}`;

  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached));

  const ukeWhere = operator_id ? eq(ukeStations.operator_id, operator_id) : undefined;
  const stationWhere = operator_id ? eq(stations.operator_id, operator_id) : undefined;

  const [ukeRows, internalRows] = await Promise.all([
    db
      .select({
        region_id: regions.id,
        region_name: regions.name,
        operator_id: operators.id,
        operator_name: operators.name,
        operator_mnc: operators.mnc,
        unique_stations: countDistinct(ukePermits.uke_station_id),
        permits: count(),
      })
      .from(ukePermits)
      .innerJoin(ukeStations, eq(ukePermits.uke_station_id, ukeStations.id))
      .innerJoin(ukeLocations, eq(ukeStations.location_id, ukeLocations.id))
      .innerJoin(regions, eq(ukeLocations.region_id, regions.id))
      .innerJoin(operators, eq(ukeStations.operator_id, operators.id))
      .where(ukeWhere)
      .groupBy(regions.id, regions.name, operators.id, operators.name, operators.mnc)
      .orderBy(regions.name),

    db
      .select({
        region_id: regions.id,
        region_name: regions.name,
        operator_id: operators.id,
        operator_name: operators.name,
        operator_mnc: operators.mnc,
        stations: countDistinct(cells.station_id),
        cells: count(),
      })
      .from(cells)
      .innerJoin(stations, eq(cells.station_id, stations.id))
      .innerJoin(locations, eq(stations.location_id, locations.id))
      .innerJoin(regions, eq(locations.region_id, regions.id))
      .innerJoin(operators, eq(stations.operator_id, operators.id))
      .where(stationWhere)
      .groupBy(regions.id, regions.name, operators.id, operators.name, operators.mnc)
      .orderBy(regions.name),
  ]);

  const response = {
    data: {
      uke: ukeRows.map((row) => ({
        region: { id: row.region_id, name: row.region_name },
        operator: { id: row.operator_id, name: row.operator_name, mnc: row.operator_mnc },
        unique_stations: row.unique_stations,
        permits: row.permits,
      })),
      internal: internalRows.map((row) => ({
        region: { id: row.region_id, name: row.region_name },
        operator: { id: row.operator_id, name: row.operator_name, mnc: row.operator_mnc },
        stations: row.stations,
        cells: row.cells,
      })),
    },
  };

  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
  res.send(response);
}

const getStatsVoivodeships: Route<ReqQuery, VoivodeshipResponse> = {
  url: "/stats/voivodeships",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  handler,
};

export default getStatsVoivodeships;
