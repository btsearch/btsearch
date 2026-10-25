import { coverageTileQuerySchema, tileParamsSchema } from "@openbts/shared/contract";
import type { CoverageTileQuery, TileParams } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertModeratesObservations, assertObservationsOn } from "../../../../../../../../features/observed/access.js";
import { observedCellsVisibleTo } from "../../../../../../../../features/observed/cells/visibility.js";
import { loadCoverageTile } from "../../../../../../../../features/observed/tiles/coverage.js";
import { STAFF_TILE_CACHE, VECTOR_TILE_TYPE, tileOf, withTileHeaders } from "../../../../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../../../../interfaces/routes.interface.js";

type RequestData = { Params: TileParams; Querystring: CoverageTileQuery };

const schemaRoute = {
  summary: "Get a coverage tile for editors",
  description:
    "The coverage tile of `GET /observed/coverage/{z}/{x}/{y}`, with the cells you may see as an editor or administrator counted too, " +
    "such as those of estimated sites that are not public. It is built each time you ask. " +
    "`GET /observed/coverage/staff/tilejson` describes the fields.",
  params: tileParamsSchema,
  querystring: coverageTileQuerySchema,
  produces: [VECTOR_TILE_TYPE],
  response: { 200: z.file() },
};
const errorReasons = {
  403: "Observed data is switched off and you are not an administrator.",
};

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  await assertObservationsOn(req);
  await assertModeratesObservations(req);

  const tile = await loadCoverageTile(tileOf(req.params), req.query.observedCellIds, await observedCellsVisibleTo(req));
  return withTileHeaders(res, STAFF_TILE_CACHE).send(tile);
}

const getStaffCoverageTile: Route<RequestData, Buffer> = {
  url: "/observed/coverage/staff/:z/:x/:y",
  method: "GET",
  config: { permissions: ["read:observations"], permissionsCheckedByHandler: ["moderate:observations"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getStaffCoverageTile;
