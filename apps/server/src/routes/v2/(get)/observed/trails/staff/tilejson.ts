import { tileJsonSchema, trailTileQuerySchema } from "@openbts/shared/contract";
import type { TileJson, TrailTileQuery } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";

import { trailTileJson } from "../../../../../../features/observed/tiles/tileJson.js";
import { PRIVATE_TILE_JSON_CACHE } from "../../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../../interfaces/routes.interface.js";

type RequestData = { Querystring: TrailTileQuery };

const schemaRoute = {
  summary: "Get the TileJSON of the trails with every country, for administrators",
  description: "The TileJSON 3.0.0 document of `GET /observed/trails/staff/{z}/{x}/{y}` for these filters.",
  querystring: trailTileQuerySchema,
  response: { 200: tileJsonSchema },
};

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  return res.header("Cache-Control", PRIVATE_TILE_JSON_CACHE).send(trailTileJson(req.query, "staff"));
}

const getStaffTrailTileJson: Route<RequestData, TileJson> = {
  url: "/observed/trails/staff/tilejson",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default getStaffTrailTileJson;
