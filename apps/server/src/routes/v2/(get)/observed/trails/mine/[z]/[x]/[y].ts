import { myTrailTileQuerySchema, tileParamsSchema } from "@openbts/shared/contract";
import type { MyTrailTileQuery, TileParams } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../../../errors.js";
import { assertObservationsOn } from "../../../../../../../../features/observed/access.js";
import { loadMyTrailTile } from "../../../../../../../../features/observed/tiles/trails.js";
import { PRIVATE_TILE_CACHE, VECTOR_TILE_TYPE, tileOf, withTileHeaders } from "../../../../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../../../../interfaces/routes.interface.js";

type RequestData = { Params: TileParams; Querystring: MyTrailTileQuery };

const schemaRoute = {
  summary: "Get a tile of your own trails",
  description:
    "Where your own uploads measured, with one layer, `trails`, and one feature per square and network. " +
    "From zoom 12 a square is a zoom-18 tile, about 100 m across. Two zooms lower it is four times as wide, and below zoom 6 the tile is empty. " +
    "Unlike the public trails, they include the ends of your trips and the places you stood still. " +
    "Bands and levels are not kept per person, so the features have neither. " +
    "Your squares can be on a network the database does not know, so they name it by `plmn`. " +
    "`GET /observed/trails/mine/tilejson` describes the fields.",
  params: tileParamsSchema,
  querystring: myTrailTileQuerySchema,
  produces: [VECTOR_TILE_TYPE],
  response: { 200: z.file() },
};
const errorReasons = { 403: "Observed data is switched off and you are not an administrator." };

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  await assertObservationsOn(req);
  const tile = await loadMyTrailTile(tileOf(req.params), userId, req.query);
  return withTileHeaders(res, PRIVATE_TILE_CACHE).send(tile);
}

const getMyTrailTile: Route<RequestData, Buffer> = {
  url: "/observed/trails/mine/:z/:x/:y",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMyTrailTile;
