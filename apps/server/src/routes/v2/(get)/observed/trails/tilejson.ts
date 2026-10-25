import { tileJsonSchema, trailTileQuerySchema } from "@openbts/shared/contract";
import type { TileJson, TrailTileQuery } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";

import { assertPublicObservationsOn } from "../../../../../features/observed/access.js";
import { trailTileJson } from "../../../../../features/observed/tiles/tileJson.js";
import { TILE_JSON_CACHE } from "../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../interfaces/routes.interface.js";

type RequestData = { Querystring: TrailTileQuery };

const schemaRoute = {
  summary: "Get the trails' TileJSON",
  description:
    "The TileJSON 3.0.0 document of the trail tiles for these filters: the tile address with your query in it, the zoom range, " +
    "the fields of the `trails` layer and the attribution the data's licence asks for.",
  querystring: trailTileQuerySchema,
  response: { 200: tileJsonSchema },
};
const errorReasons = { 403: "Observed data is switched off." };

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  assertPublicObservationsOn();
  return res.header("Cache-Control", TILE_JSON_CACHE).send(trailTileJson(req.query, "public"));
}

const getTrailTileJson: Route<RequestData, TileJson> = {
  url: "/observed/trails/tilejson",
  method: "GET",
  config: { permissions: ["read:observations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getTrailTileJson;
