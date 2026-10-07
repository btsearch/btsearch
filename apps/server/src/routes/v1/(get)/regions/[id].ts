import { regions } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { IdParams, JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const regionsSchema = createSelectSchema(regions);
const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({
      data: regionsSchema,
    }),
  },
};
type Region = z.infer<typeof regionsSchema>;

async function handler(req: FastifyRequest<IdParams>, res: ReplyPayload<JSONBody<Region>>) {
  const { id } = req.params;

  const region = await db.query.regions.findFirst({
    where: {
      id: id,
      countryCode: LEGACY_COUNTRY_CODE,
    },
  });
  if (!region) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: region });
}

const getRegion: Route<IdParams, Region> = {
  url: "/regions/:id",
  method: "GET",
  config: { permissions: ["read:regions"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getRegion;
