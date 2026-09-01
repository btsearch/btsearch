import { bands, operators, ukeLocations, ukePermitSectors, ukePermits, ukeStations } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const ukePermitsSchema = createSelectSchema(ukePermits).omit({ band_id: true, uke_station_id: true });
const bandsSchema = createSelectSchema(bands);
const operatorsSchema = createSelectSchema(operators);
const ukeLocationsSchema = createSelectSchema(ukeLocations).omit({ point: true, region_id: true });
const ukeStationsSchema = createSelectSchema(ukeStations).omit({ operator_id: true, location_id: true });
const sectorsSchema = createSelectSchema(ukePermitSectors).omit({ permit_id: true });
type Permit = z.infer<typeof ukePermitsSchema> & {
  band?: z.infer<typeof bandsSchema>;
  station?: z.infer<typeof ukeStationsSchema> & {
    operator?: z.infer<typeof operatorsSchema>;
    location?: z.infer<typeof ukeLocationsSchema>;
  };
};

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({
      data: z.array(
        ukePermitsSchema.extend({
          band: bandsSchema.optional(),
          station: ukeStationsSchema
            .extend({
              operator: operatorsSchema.optional(),
              location: ukeLocationsSchema.optional(),
            })
            .optional(),
          sectors: z.array(sectorsSchema).optional(),
        }),
      ),
    }),
  },
};
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Permit[]>>) {
  const { station_id } = req.params;
  if (Number.isNaN(station_id)) throw new ErrorResponse("INVALID_QUERY");

  const station = await db.query.stations.findFirst({
    where: { id: station_id },
  });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  try {
    const permitsLinks = await db.query.stationsPermits.findMany({
      where: { station_id: station_id },
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

    if (!permitsLinks.length) throw new ErrorResponse("NOT_FOUND");

    const stationPermits = permitsLinks.map((link) => link.permit).filter((permit): permit is NonNullable<typeof permit> => permit !== null);
    if (!stationPermits.length) throw new ErrorResponse("NOT_FOUND");

    return res.send({ data: stationPermits });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const getStationPermits: Route<ReqParams, Permit[]> = {
  url: "/stations/:station_id/permits",
  method: "GET",
  config: { permissions: ["read:stations", "read:uke_permits"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStationPermits;
