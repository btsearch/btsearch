import { coverageTileQuerySchema, tileJsonSchema } from "@openbts/shared/contract";
import type { CoverageTileQuery, TileJson } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";

import { assertModeratesObservations, assertObservationsOn } from "../../../../../../features/observed/access.js";
import { coverageTileJson } from "../../../../../../features/observed/tiles/tileJson.js";
import { PRIVATE_TILE_JSON_CACHE } from "../../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../../interfaces/routes.interface.js";

type RequestData = { Querystring: CoverageTileQuery };

const schemaRoute = {
  summary: "Get the TileJSON of the coverage tiles for editors",
  description: "The TileJSON 3.0.0 document of `GET /observed/coverage/staff/{z}/{x}/{y}` for these cells.",
  querystring: coverageTileQuerySchema,
  response: { 200: tileJsonSchema },
};
const errorReasons = { 403: "Observed data is switched off and you are not an administrator." };

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  await assertObservationsOn(req);
  await assertModeratesObservations(req);
  return res.header("Cache-Control", PRIVATE_TILE_JSON_CACHE).send(coverageTileJson(req.query, "staff"));
}

const getStaffCoverageTileJson: Route<RequestData, TileJson> = {
  url: "/observed/coverage/staff/tilejson",
  method: "GET",
  config: { permissions: ["read:observations"], permissionsCheckedByHandler: ["moderate:observations"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getStaffCoverageTileJson;
