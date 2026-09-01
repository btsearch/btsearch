import { bands, operators, ukeLocations, ukePermitSectors, ukePermits, ukeStations } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const permitsSchema = createSelectSchema(ukePermits).omit({ band_id: true, uke_station_id: true });
const bandsSchema = createSelectSchema(bands);
const ukePermitsSchema = createSelectSchema(ukePermits).omit({ band_id: true, uke_station_id: true });
const operatorsSchema = createSelectSchema(operators);
const ukeLocationsSchema = createSelectSchema(ukeLocations).omit({ point: true, region_id: true });
const ukeStationsSchema = createSelectSchema(ukeStations).omit({ operator_id: true, location_id: true });
const sectorsSchema = createSelectSchema(ukePermitSectors).omit({ permit_id: true });
type Permit = z.infer<typeof ukePermitsSchema> & {
  band: z.infer<typeof bandsSchema>;
  station: z.infer<typeof ukeStationsSchema> & {
    operator: z.infer<typeof operatorsSchema>;
    location: z.infer<typeof ukeLocationsSchema>;
  };
};

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
    permit_id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({
      data: permitsSchema.extend({
        band: bandsSchema,
        station: ukeStationsSchema.extend({
          operator: operatorsSchema,
          location: ukeLocationsSchema,
        }),
        sectors: z.array(sectorsSchema).optional(),
      }),
    }),
  },
};
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Permit>>) {
  const { station_id, permit_id } = req.params;
  if (Number.isNaN(station_id) || Number.isNaN(permit_id)) throw new ErrorResponse("INVALID_QUERY");

  try {
    const station = await db.query.stations.findFirst({
      where: {
        RAW: (fields, { eq }) => eq(fields.id, station_id),
      },
    });
    if (!station) throw new ErrorResponse("NOT_FOUND");

    const permitLink = await db.query.stationsPermits.findFirst({
      where: {
        AND: [{ station_id: { eq: station_id } }, { permit_id: { eq: permit_id } }],
      },
      with: {
        permit: {
          columns: {
            band_id: false,
            uke_station_id: false,
          },
          with: {
            band: true,
            station: {
              columns: {
                operator_id: false,
                location_id: false,
              },
              with: {
                operator: true,
                location: { columns: { point: false, region_id: false } },
              },
            },
            sectors: {
              columns: {
                permit_id: false,
              },
            },
          },
        },
      },
    });
    if (!permitLink || !permitLink.permit) throw new ErrorResponse("NOT_FOUND");

    return res.send({ data: permitLink.permit });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const getStationPermit: Route<ReqParams, Permit> = {
  url: "/stations/:station_id/permits/:permit_id",
  method: "GET",
  config: { permissions: ["read:stations", "read:uke_permits"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStationPermit;
