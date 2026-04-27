import { cells, locations, stations, ukeImportMetadata, ukeLocations, ukePermits, ukeRadiolines } from "@openbts/drizzle";
import { and, count, desc, eq, max, or } from "drizzle-orm";
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

async function handler(_: FastifyRequest, res: ReplyPayload<JSONBody<Response>>) {
  const [importTimestamps, stationsLastUpdatedResult, ...countResults] = await Promise.all([
    db
      .select({
        import_type: ukeImportMetadata.import_type,
        last_import_date: ukeImportMetadata.last_import_date,
      })
      .from(ukeImportMetadata)
      .where(
        and(
          eq(ukeImportMetadata.status, "success"),
          or(
            eq(ukeImportMetadata.import_type, "permits"),
            eq(ukeImportMetadata.import_type, "device_registry"),
            eq(ukeImportMetadata.import_type, "radiolines"),
          ),
        ),
      )
      .orderBy(desc(ukeImportMetadata.last_import_date)),

    db.select({ value: max(stations.updatedAt) }).from(stations),

    db.select({ value: count() }).from(locations),
    db.select({ value: count() }).from(stations),
    db.select({ value: count() }).from(cells),
    db.select({ value: count() }).from(ukeLocations),
    db.select({ value: count() }).from(ukePermits),
    db.select({ value: count() }).from(ukeRadiolines),
  ]);

  const lastUpdated: Response["lastUpdated"] = {
    stations: stationsLastUpdatedResult[0]?.value?.toISOString() ?? null,
    stations_permits: null,
    radiolines: null,
  };

  for (const row of importTimestamps) {
    if ((row.import_type === "permits" || row.import_type === "device_registry") && !lastUpdated.stations_permits)
      lastUpdated.stations_permits = row.last_import_date.toISOString();
    else if (row.import_type === "radiolines" && !lastUpdated.radiolines) lastUpdated.radiolines = row.last_import_date.toISOString();
  }

  const [locationsCount, stationsCount, cellsCount, ukeLocationsCount, ukePermitsCount, ukeRadiolinesCount] = countResults;

  res.send({
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
