import { myTrailTileQuerySchema, tileJsonSchema } from "@openbts/shared/contract";
import type { MyTrailTileQuery, TileJson } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";

import { assertObservationsOn } from "../../../../../../features/observed/access.js";
import { myTrailTileJson } from "../../../../../../features/observed/tiles/tileJson.js";
import { PRIVATE_TILE_JSON_CACHE } from "../../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../../interfaces/routes.interface.js";

type RequestData = { Querystring: MyTrailTileQuery };

const schemaRoute = {
  summary: "Get the TileJSON of your own trails",
  description: "The TileJSON 3.0.0 document of `GET /observed/trails/mine/{z}/{x}/{y}` for these filters.",
  querystring: myTrailTileQuerySchema,
  response: { 200: tileJsonSchema },
};
const errorReasons = { 403: "Observed data is switched off and you are not an administrator." };

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  await assertObservationsOn(req);
  return res.header("Cache-Control", PRIVATE_TILE_JSON_CACHE).send(myTrailTileJson(req.query));
}

const getMyTrailTileJson: Route<RequestData, TileJson> = {
  url: "/observed/trails/mine/tilejson",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMyTrailTileJson;
