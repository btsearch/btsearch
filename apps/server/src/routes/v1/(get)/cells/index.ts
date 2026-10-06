import { bands, cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { stationIdInLegacyCountry } from "../../../../features/countries/legacy.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const cellsSchema = createSelectSchema(cells).omit({ band_id: true, station_id: true });
const stationsSchema = createSelectSchema(stations).omit({ status: true });
const bandsSchema = createSelectSchema(bands);
const gsmCellsSchema = createSelectSchema(gsmCells).omit({ cell_id: true });
const umtsCellsSchema = createSelectSchema(umtsCells).omit({ cell_id: true });
const lteCellsSchema = createSelectSchema(lteCells).omit({ cell_id: true });
const nrCellsSchema = createSelectSchema(nrCells).omit({ cell_id: true });
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();
const cellResponseSchema = cellsSchema.extend({
  station: stationsSchema,
  band: bandsSchema,
  details: cellDetailsSchema,
});
const schemaRoute = {
  querystring: z.object({
    limit: z.coerce.number().min(1).max(1000).optional().default(150),
    page: z.coerce.number().min(1).default(1),
  }),
  response: {
    200: z.object({
      data: z.array(cellResponseSchema),
    }),
  },
};
type ResponseData = z.infer<typeof cellResponseSchema>[];
type CellWithRat = z.infer<typeof cellsSchema> & {
  station: z.infer<typeof stationsSchema>;
  band: z.infer<typeof bandsSchema>;
  gsm?: z.infer<typeof gsmCellsSchema> | null;
  umts?: z.infer<typeof umtsCellsSchema> | null;
  lte?: z.infer<typeof lteCellsSchema> | null;
  nr?: z.infer<typeof nrCellsSchema> | null;
};
type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { limit, page } = req.query;
  const offset = limit ? (page - 1) * limit : undefined;

  const rows = await db.query.cells.findMany({
    where: {
      station: { status: "published" },
      RAW: (fields) => stationIdInLegacyCountry(fields.station_id),
    },
    with: {
      station: {
        columns: { status: false },
      },
      band: true,
      gsm: true,
      umts: true,
      lte: true,
      nr: true,
    },
    limit,
    offset,
    orderBy: { id: "asc" },
  });

  const data: ResponseData = rows.map((cell: CellWithRat) => {
    const { gsm, umts, lte, nr, ...rest } = cell;
    return {
      ...rest,
      details: gsm ?? umts ?? lte ?? nr ?? null,
    };
  });

  return res.send({ data });
}

const getCells: Route<ReqQuery, ResponseData> = {
  url: "/cells",
  method: "GET",
  config: { permissions: ["read:cells"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getCells;
