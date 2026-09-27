import { bands, cells, extraIdentificators, locations, operators, regions, stations } from "@openbts/drizzle";
import { LocationResponseType } from "@openbts/proto/server";
import { sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { buildStationFilterConditions, resolveStationFilter } from "../../../../services/stations/filter.js";
import { parseStationStatusParam } from "../../../../services/stations/status.js";
import { parseUplinkTypesParam } from "../../../../services/stations/uplink.js";

const locationsSchema = createSelectSchema(locations).omit({ point: true, region_id: true });
const regionsSchema = createSelectSchema(regions);
const stationsSchema = createSelectSchema(stations).omit({ operator_id: true, location_id: true });
const cellsSchema = createSelectSchema(cells).omit({ band_id: true, station_id: true });
const bandsSchema = createSelectSchema(bands);
const operatorSchema = createSelectSchema(operators);
const extraIdentificatorsSchema = createSelectSchema(extraIdentificators).omit({ station_id: true });
const cellResponseSchema = cellsSchema.extend({ band: bandsSchema });
const stationResponseSchema = stationsSchema.extend({
  cells: z.array(cellResponseSchema),
  operator: operatorSchema,
  extra_identificators: extraIdentificatorsSchema.optional(),
});

const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  querystring: z.object({
    rat: z
      .string()
      .regex(/^(?:cdma|umts|gsm|lte|nr|iot)(?:,(?:cdma|umts|gsm|lte|nr|iot))*$/i)
      .optional()
      .transform((val): string[] | undefined => (val ? val.toLowerCase().split(",").filter(Boolean) : undefined)),
    status: z
      .string()
      .regex(/^(?:published|pending|inactive)(?:,(?:published|pending|inactive))*$/)
      .optional()
      .transform(parseStationStatusParam),
    operators: z
      .string()
      .regex(/^\d+(,\d+)*$/)
      .optional()
      .transform((val): number[] | undefined =>
        val
          ? val
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          : undefined,
      ),
    bands: z
      .string()
      .regex(/^\d+(,\d+)*$/)
      .optional()
      .transform((val): number[] | undefined =>
        val
          ? val
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          : undefined,
      ),
    since: z
      .string()
      .regex(/^(createdAt|updatedAt)(?:,(createdAt|updatedAt))?:\d+$/)
      .optional()
      .transform((val) => {
        if (!val) return null;
        const lastIndex = val.lastIndexOf(":");
        const fields = val.slice(0, lastIndex).split(",") as ("createdAt" | "updatedAt")[];
        const days = Number(val.slice(lastIndex + 1));
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return { fields, cutoff };
      }),
    uplink: z
      .string()
      .regex(/^(?:fiber|microwave)(?:,(?:fiber|microwave))*$/)
      .optional()
      .transform(parseUplinkTypesParam),
  }),
  response: {
    200: z.object({
      data: locationsSchema.extend({
        region: regionsSchema,
        stations: z.array(stationResponseSchema),
      }),
    }),
  },
};

type ReqParams = { Params: { id: number }; Querystring: z.infer<typeof schemaRoute.querystring> };
type StationData = z.infer<typeof stationResponseSchema>;
type ResponseData = z.infer<typeof locationsSchema> & { region: z.infer<typeof regionsSchema>; stations: StationData[] };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { id } = req.params;
  const stationFilter = await resolveStationFilter(req.query);

  const buildStationFilter = (stationFields: typeof stations) =>
    stationFilter ? sql`(${sql.join(buildStationFilterConditions(stationFields, stationFilter), sql` AND `)})` : sql`false`;

  const location = await db.query.locations.findFirst({
    where: {
      id: id,
    },
    columns: {
      point: false,
      region_id: false,
    },
    with: {
      region: true,
      stations: {
        columns: { location_id: false, operator_id: false },
        where: { RAW: (fields) => buildStationFilter(fields) },
        with: {
          cells: {
            columns: { band_id: false, station_id: false },
            with: { band: true },
          },
          operator: true,
          extra_identificators: { columns: { station_id: false } },
        },
      },
    },
  });

  if (!location) throw new ErrorResponse("NOT_FOUND");

  const cleanedStations = location.stations.map((station) => {
    const stationData = { ...station } as StationData & { extra_identificators?: unknown };
    if (!stationData.extra_identificators) delete stationData.extra_identificators;
    return stationData as StationData;
  });

  return res.send({ data: { ...location, stations: cleanedStations } });
}

const getLocation: Route<ReqParams, ResponseData> = {
  url: "/locations/:id",
  method: "GET",
  config: { permissions: ["read:locations"], allowGuestAccess: true, proto: LocationResponseType },
  schema: schemaRoute,
  handler,
};

export default getLocation;
