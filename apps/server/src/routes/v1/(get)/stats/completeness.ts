import { extraIdentificators, lteCells, nrCells, stationSectors, stations } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { count, countDistinct, isNotNull } from "drizzle-orm";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import z from "zod";

import redis from "../../../../database/redis.ts";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.ts";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.ts";

const CACHE_TTL = 86400;

const ratObjectDetails = z.object({
  documented: z.number(),
  missing: z.number(),
});

const schemaRoute = {
  response: {
    200: z.object({
      data: z.object({
        stations: z.object({
          total: z.number(),
          withSectors: z.number(),
          withExtraIds: z.number(),
        }),
        cells: z.object({
          lte: ratObjectDetails,
          nr: ratObjectDetails,
        }),
      }),
    }),
  },
};

type ResBody = z.infer<(typeof schemaRoute.response)["200"]>;

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<ResBody>>) {
  const cacheKey = "stats:completeness:v2";
  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached));

  const [totalRows, sectorRows, extraRows, ltePCI, lteAll, nrPCI, nrAll] = await Promise.all([
    db.select({ count: count() }).from(stations),
    db.select({ count: countDistinct(stationSectors.station_id) }).from(stationSectors),
    db.select({ count: countDistinct(extraIdentificators.station_id) }).from(extraIdentificators),
    db.select({ count: count() }).from(lteCells).where(isNotNull(lteCells.pci)),
    db.select({ count: count() }).from(lteCells),
    db.select({ count: count() }).from(nrCells).where(isNotNull(nrCells.pci)),
    db.select({ count: count() }).from(nrCells),
  ]);

  const ltePCIExisting = ltePCI[0]?.count ?? 0;
  const nrPCIExisting = nrPCI[0]?.count ?? 0;
  const response = {
    data: {
      stations: {
        total: totalRows[0]?.count ?? 0,
        withSectors: sectorRows[0]?.count ?? 0,
        withExtraIds: extraRows[0]?.count ?? 0,
      },
      cells: {
        lte: {
          documented: ltePCIExisting,
          missing: (lteAll[0]?.count ?? 0) - ltePCIExisting,
        },
        nr: {
          documented: nrPCIExisting,
          missing: (nrAll[0]?.count ?? 0) - nrPCIExisting,
        },
      },
    },
  };
  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
  return res.send(response);
}

const getStatsCompleteness: Route<RouteGenericInterface, ResBody> = {
  url: "/stats/completeness",
  method: "GET",
  schema: schemaRoute,
  config: {
    permissions: ["read:stats"],
    allowGuestAccess: true,
  },
  handler,
};

export default getStatsCompleteness;
