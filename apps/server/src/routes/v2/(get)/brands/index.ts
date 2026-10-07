import { brands } from "@openbts/drizzle";
import { brandSchema } from "@openbts/shared/contract";
import type { Brand } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { toBrand } from "../../../../features/brands/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List brands",
  description: "Returns all brands in one response, sorted by name. `logo.url` is a path from the site root, not from the API base path.",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: z.array(brandSchema),
    }),
  },
};

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<Brand[]>>) {
  const rows = await db.select().from(brands).orderBy(brands.name, brands.id);

  return res.send({ data: rows.map(toBrand) });
}

const getBrands: Route<RouteGenericInterface, Brand[]> = {
  url: "/brands",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getBrands;
