import { bands, operators, ukeLocations, ukePermitSectors, ukePermits, ukeStations } from "@openbts/drizzle";
import { ukePermitResponseType } from "@openbts/proto/server";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { IdParams, JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const permitsSchema = createSelectSchema(ukePermits).omit({ band_id: true, uke_station_id: true });
const bandsSchema = createSelectSchema(bands);
const operatorsSchema = createSelectSchema(operators);
const ukeLocationsSchema = createSelectSchema(ukeLocations);
const ukeStationsSchema = createSelectSchema(ukeStations).omit({ operator_id: true, location_id: true });
const sectorsSchema = createSelectSchema(ukePermitSectors).omit({ permit_id: true });
const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
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
type Permit = z.infer<typeof permitsSchema> & {
  band: z.infer<typeof bandsSchema>;
  station: z.infer<typeof ukeStationsSchema> & {
    operator: z.infer<typeof operatorsSchema>;
    location: z.infer<typeof ukeLocationsSchema>;
  };
  sectors: z.infer<typeof sectorsSchema>[];
};

async function handler(req: FastifyRequest<IdParams>, res: ReplyPayload<JSONBody<Permit>>) {
  const { id } = req.params;

  try {
    const permit = await db.query.ukePermits.findFirst({
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
            location: true,
          },
        },
        sectors: {
          columns: {
            permit_id: false,
          },
        },
      },
      where: {
        id: id,
      },
    });
    if (!permit) throw new ErrorResponse("NOT_FOUND");

    return res.send({
      data: permit,
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const getUkePermit: Route<IdParams, Permit> = {
  url: "/uke/permits/:id",
  method: "GET",
  config: { permissions: ["read:uke_permits"], allowGuestAccess: true, proto: ukePermitResponseType },
  schema: schemaRoute,
  handler,
};

export default getUkePermit;
