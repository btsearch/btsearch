import { coverageTileQuerySchema, tileParamsSchema } from "@openbts/shared/contract";
import type { CoverageTileQuery, TileParams } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertPublicObservationsOn } from "../../../../../../../features/observed/access.js";
import { isPublicObservedCell } from "../../../../../../../features/observed/cells/visibility.js";
import { loadCoverageTile } from "../../../../../../../features/observed/tiles/coverage.js";
import { PUBLIC_TILE_CACHE, VECTOR_TILE_TYPE, tileOf, withTileHeaders } from "../../../../../../../features/observed/tiles/vectorTiles.js";
import type { Route } from "../../../../../../../interfaces/routes.interface.js";

type RequestData = { Params: TileParams; Querystring: CoverageTileQuery };

const schemaRoute = {
  summary: "Get a coverage tile",
  description:
    "Where phones measured the cells you name, with one layer, `coverage`, and one feature per square. " +
    "Each square names the cell that served most there, or the one with the most samples where none of them served, and that cell's id is also the feature id. " +
    "Ask for one cell to see its signal everywhere it was measured. A cell's copies under other networks count as the cell itself. " +
    "A square shows only when fewer than half of its samples were taken while standing still, " +
    "and only the cells everyone may see count: those matched to a station in a country whose observations are public, and those of public estimated sites. " +
    "Editors get the other cells they may see at `GET /observed/coverage/staff/{z}/{x}/{y}`. " +
    "From zoom 14 a square is a zoom-20 tile, at zooms 12 and 13 a zoom-18 tile, and below zoom 12 the tile is empty. " +
    "`GET /observed/coverage/tilejson` describes the fields.",
  params: tileParamsSchema,
  querystring: coverageTileQuerySchema,
  produces: [VECTOR_TILE_TYPE],
  response: { 200: z.file() },
};
const errorReasons = { 403: "Observed data is switched off." };

async function handler(req: FastifyRequest<RequestData>, res: FastifyReply) {
  assertPublicObservationsOn();
  const tile = await loadCoverageTile(tileOf(req.params), req.query.observedCellIds, isPublicObservedCell());
  return withTileHeaders(res, PUBLIC_TILE_CACHE).send(tile);
}

const getCoverageTile: Route<RequestData, Buffer> = {
  url: "/observed/coverage/:z/:x/:y",
  method: "GET",
  config: { permissions: ["read:observations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getCoverageTile;
