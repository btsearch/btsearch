import { cellParamsSchema, cellQuerySchema, listedCellSchema } from "@openbts/shared/contract";
import type { CellQuery, ListedCell } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { findListedCell, serializeCell } from "../../../../features/cells/read.js";
import { findVisibleStation } from "../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a cell",
  description: "Returns a single cell. Cells of inactive stations are returned too, even though `GET /cells` leaves them out by default.",
  params: cellParamsSchema,
  querystring: cellQuerySchema,
  response: {
    200: z.object({
      data: listedCellSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof cellParamsSchema> };
type ReqQuery = { Querystring: CellQuery };
type RequestData = ReqParams & ReqQuery;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ListedCell>>) {
  const row = await findListedCell(req.params.id);
  await findVisibleStation(req, row.station.id);

  return res.send({ data: await serializeCell(row, req.query.include) });
}

const getCell: Route<RequestData, ListedCell> = {
  url: "/cells/:id",
  method: "GET",
  config: {
    permissions: ["read:cells"],
    allowGuestAccess: true,
    errorReasons: { 404: "The cell does not exist, or its station is in a country you cannot access." },
  },
  schema: schemaRoute,
  handler,
};

export default getCell;
