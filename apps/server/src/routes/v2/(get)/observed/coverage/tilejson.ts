import { coverageTileQuerySchema, tileJsonSchema } from "@openbts/shared/contract";
import type { CoverageTileQuery, TileJson } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";

import { assertPublicObservationsOn } from "../../../../../features/observed/access.js";
import { coverageTileJson } from "../../../../../features/observed/tiles/tileJson.js";
import { TILE_JSON_CACHE } from "../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../interfaces/routes.interface.js";

type RequestData = { Querystring: CoverageTileQuery };

const schemaRoute = {
  summary: "Get the coverage TileJSON",
  description:
    "The TileJSON 3.0.0 document of the coverage tiles of these cells: the tile address with your query in it, the zoom range, " +
    "the fields of the `coverage` layer and the attribution the data's licence asks for.",
  querystring: coverageTileQuerySchema,
  response: { 200: tileJsonSchema },
};
const errorReasons = { 403: "Observed data is switched off." };

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  assertPublicObservationsOn();
  return res.header("Cache-Control", TILE_JSON_CACHE).send(coverageTileJson(req.query, "public"));
}

const getCoverageTileJson: Route<RequestData, TileJson> = {
  url: "/observed/coverage/tilejson",
  method: "GET",
  config: { permissions: ["read:observations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getCoverageTileJson;
