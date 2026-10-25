import { tileParamsSchema, trailTileQuerySchema } from "@openbts/shared/contract";
import type { TileParams, TrailTileQuery } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadTrailTile } from "../../../../../../../../features/observed/tiles/trails.js";
import { STAFF_TILE_CACHE, VECTOR_TILE_TYPE, tileOf, withTileHeaders } from "../../../../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../../../../interfaces/routes.interface.js";

type RequestData = { Params: TileParams; Querystring: TrailTileQuery };

const schemaRoute = {
  summary: "Get a trail tile with every country, for administrators",
  description:
    "The public trail tile with hidden countries and countries whose observations are not public in it. " +
    "It is built each time you ask. `GET /observed/trails/staff/tilejson` describes the fields.",
  params: tileParamsSchema,
  querystring: trailTileQuerySchema,
  produces: [VECTOR_TILE_TYPE],
  response: { 200: z.file() },
};

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  const tile = await loadTrailTile(tileOf(req.params), req.query, "staff");
  return withTileHeaders(res, STAFF_TILE_CACHE).send(tile);
}

const getStaffTrailTile: Route<RequestData, Buffer> = {
  url: "/observed/trails/staff/:z/:x/:y",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default getStaffTrailTile;
