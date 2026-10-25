import { tileParamsSchema, trailTileQuerySchema } from "@openbts/shared/contract";
import type { TileParams, TrailTileQuery } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertPublicObservationsOn } from "../../../../../../../features/observed/access.js";
import { loadTrailTile } from "../../../../../../../features/observed/tiles/trails.js";
import { PUBLIC_TILE_CACHE, VECTOR_TILE_TYPE, tileOf, withTileHeaders } from "../../../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../../../interfaces/routes.interface.js";

type RequestData = { Params: TileParams; Querystring: TrailTileQuery };

const schemaRoute = {
  summary: "Get a trail tile",
  description:
    "Where the operators' networks served the phones of people measuring with the BTSearch app, with one layer, `trails`, and one feature per square and band. " +
    "From zoom 14 a square is a zoom-20 tile, about 25 m across at mid-latitudes. Two zooms lower it is four times as wide, and below zoom 6 the tile is empty. " +
    "The first and last 100 m of every trip and readings taken while standing still are never part of a trail. " +
    "`GET /observed/trails/tilejson` describes the fields, and your own trails are at `GET /observed/trails/mine/{z}/{x}/{y}`.",
  params: tileParamsSchema,
  querystring: trailTileQuerySchema,
  produces: [VECTOR_TILE_TYPE],
  response: { 200: z.file() },
};
const errorReasons = { 403: "Observed data is switched off." };

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  assertPublicObservationsOn();
  const tile = await loadTrailTile(tileOf(req.params), req.query, "public");
  return withTileHeaders(res, PUBLIC_TILE_CACHE).send(tile);
}

const getTrailTile: Route<RequestData, Buffer> = {
  url: "/observed/trails/:z/:x/:y",
  method: "GET",
  config: { permissions: ["read:observations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getTrailTile;
