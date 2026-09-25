import { cells, locations, stations, ukeImportMetadata, ukeLocations, ukePermits, ukeRadiolines } from "@openbts/drizzle";
import { and, count, eq, inArray, max } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../database/psql.js";
import type { ReplyPayload } from "../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../interfaces/routes.interface.js";

interface Response {
  lastUpdated: {
    stations: string | null;
    stations_permits: string | null;
    radiolines: string | null;
  };
  counts: {
    locations: number;
    stations: number;
    cells: number;
    uke_locations: number;
    uke_permits: number;
    uke_radiolines?: number;
  };
}

const schemaRoute = {
  response: {
    200: z.object({
      data: z.object({
        lastUpdated: z.object({
          stations: z.string().nullable(),
          stations_permits: z.string().nullable(),
          radiolines: z.string().nullable(),
        }),
        counts: z.object({
          locations: z.number(),
          stations: z.number(),
          cells: z.number(),
          uke_locations: z.number(),
          uke_permits: z.number(),
          uke_radiolines: z.number().optional(),
        }),
      }),
    }),
  },
};

const stationsLastUpdatedQuery = db
  .select({ value: max(stations.updatedAt) })
  .from(stations)
  .prepare("stats_stations_last_updated");
const permitsImportQuery = db
  .select({ value: max(ukeImportMetadata.last_import_date) })
  .from(ukeImportMetadata)
  .where(and(eq(ukeImportMetadata.status, "success"), inArray(ukeImportMetadata.import_type, ["permits", "device_registry"])))
  .prepare("stats_permits_last_import");
const radiolinesImportQuery = db
  .select({ value: max(ukeImportMetadata.last_import_date) })
  .from(ukeImportMetadata)
  .where(and(eq(ukeImportMetadata.status, "success"), eq(ukeImportMetadata.import_type, "radiolines")))
  .prepare("stats_radiolines_last_import");
const locationsCountQuery = db.select({ value: count() }).from(locations).prepare("stats_locations_count");
const stationsCountQuery = db.select({ value: count() }).from(stations).prepare("stats_stations_count");
const cellsCountQuery = db.select({ value: count() }).from(cells).prepare("stats_cells_count");
const ukeLocationsCountQuery = db.select({ value: count() }).from(ukeLocations).prepare("stats_uke_locations_count");
const ukePermitsCountQuery = db.select({ value: count() }).from(ukePermits).prepare("stats_uke_permits_count");
const ukeRadiolinesCountQuery = db.select({ value: count() }).from(ukeRadiolines).prepare("stats_uke_radiolines_count");

async function handler(_: FastifyRequest, res: ReplyPayload<JSONBody<Response>>) {
  const [stationsLastUpdatedResult, permitsImportResult, radiolinesImportResult, ...countResults] = await Promise.all([
    stationsLastUpdatedQuery.execute(),
    permitsImportQuery.execute(),
    radiolinesImportQuery.execute(),
    locationsCountQuery.execute(),
    stationsCountQuery.execute(),
    cellsCountQuery.execute(),
    ukeLocationsCountQuery.execute(),
    ukePermitsCountQuery.execute(),
    ukeRadiolinesCountQuery.execute(),
  ]);

  const lastUpdated: Response["lastUpdated"] = {
    stations: stationsLastUpdatedResult[0]?.value ? new Date(stationsLastUpdatedResult[0].value).toISOString() : null,
    stations_permits: permitsImportResult[0]?.value ? new Date(permitsImportResult[0].value).toISOString() : null,
    radiolines: radiolinesImportResult[0]?.value ? new Date(radiolinesImportResult[0].value).toISOString() : null,
  };

  const [locationsCount, stationsCount, cellsCount, ukeLocationsCount, ukePermitsCount, ukeRadiolinesCount] = countResults;

  return res.send({
    data: {
      lastUpdated,
      counts: {
        locations: locationsCount[0]?.value ?? 0,
        stations: stationsCount[0]?.value ?? 0,
        cells: cellsCount[0]?.value ?? 0,
        uke_locations: ukeLocationsCount[0]?.value ?? 0,
        uke_permits: ukePermitsCount[0]?.value ?? 0,
        uke_radiolines: ukeRadiolinesCount[0]?.value ?? 0,
      },
    },
  });
}

const getStats: Route<never, Response> = {
  url: "/stats",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  handler,
};

export default getStats;
