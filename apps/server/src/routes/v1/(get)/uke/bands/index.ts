import { ukeBands } from "@openbts/drizzle";
import type { FastifyRequest, RouteGenericInterface } from "fastify";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { PERMIT_BAND_ORDER, type PermitBand, permitBandSchema, toPermitBand } from "../../../../../features/permits/bands.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  response: {
    200: z.object({ data: z.array(permitBandSchema) }),
  },
};

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<PermitBand[]>>) {
  try {
    const rows = await db
      .select()
      .from(ukeBands)
      .orderBy(...PERMIT_BAND_ORDER);
    return res.send({ data: rows.map(toPermitBand) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const getUkeBands: Route<RouteGenericInterface, PermitBand[]> = {
  url: "/uke/bands",
  method: "GET",
  config: { permissions: ["read:uke_permits"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getUkeBands;
