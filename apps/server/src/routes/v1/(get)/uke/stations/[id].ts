import { bands, operators, regions, ukeLocations, ukePermitSectors, ukePermits, ukeStations } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const ukeStationsSchema = createSelectSchema(ukeStations)
  .omit({ operator_id: true, location_id: true })
  .extend({ createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) });
const ukeLocationsSchema = createSelectSchema(ukeLocations)
  .omit({ point: true, region_id: true })
  .extend({ createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) });
const ukePermitsSchema = createSelectSchema(ukePermits)
  .omit({ uke_station_id: true, band_id: true })
  .extend({
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    expiry_date: z.iso.datetime({ offset: true }),
  });
const bandsSchema = createSelectSchema(bands);
const operatorsSchema = createSelectSchema(operators);
const regionsSchema = createSelectSchema(regions);
const sectorsSchema = createSelectSchema(ukePermitSectors).omit({ permit_id: true }).extend({ antenna_height: z.number().nullable() });

const permitResponseSchema = ukePermitsSchema.extend({
  band: bandsSchema.nullable(),
  sectors: z.array(sectorsSchema),
});

const stationResponseSchema = ukeStationsSchema.extend({
  operator: operatorsSchema.nullable(),
  location: ukeLocationsSchema.extend({ region: regionsSchema }),
  permits: z.array(permitResponseSchema),
});

const responseSchema = z.object({
  data: stationResponseSchema,
});

const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  response: {
    200: responseSchema,
  },
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type StationData = z.infer<typeof stationResponseSchema>;
type ResponseBody = z.infer<typeof responseSchema>;

function iso(date: Date): string {
  return date.toISOString();
}

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const { id } = req.params;

  try {
    const station = await db.query.ukeStations.findFirst({
      columns: {
        operator_id: false,
        location_id: false,
      },
      with: {
        operator: true,
        location: {
          columns: {
            point: false,
            region_id: false,
          },
          with: {
            region: true,
          },
        },
        permits: {
          columns: {
            uke_station_id: false,
            band_id: false,
          },
          with: {
            band: true,
            sectors: {
              columns: {
                permit_id: false,
              },
            },
          },
        },
      },
      where: {
        id,
      },
    });
    if (!station) throw new ErrorResponse("NOT_FOUND");

    const data = {
      ...station,
      createdAt: iso(station.createdAt),
      updatedAt: iso(station.updatedAt),
      location: {
        ...station.location,
        createdAt: iso(station.location.createdAt),
        updatedAt: iso(station.location.updatedAt),
      },
      permits: station.permits.map((permit) => ({
        ...permit,
        expiry_date: iso(permit.expiry_date),
        createdAt: iso(permit.createdAt),
        updatedAt: iso(permit.updatedAt),
      })),
    } satisfies StationData;

    return res.send({ data });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", {
      message: error instanceof Error ? error.message : "Unknown error",
      cause: error,
    });
  }
}

const getUkeStation: Route<ReqParams, ResponseBody> = {
  url: "/uke/stations/:id",
  method: "GET",
  config: { permissions: ["read:uke_permits"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getUkeStation;
