import { bands, cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { disabledCountryFeatures, getStationCountryFeatures } from "../../../../features/stations/countryFeatures.js";
import { toLegacyCellDetails } from "../../../../features/stations/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { IdParams, JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const cellsSchema = createSelectSchema(cells).omit({ band_id: true });
const stationsSchema = createSelectSchema(stations);
const bandsSchema = createSelectSchema(bands);
const gsmCellsSchema = createSelectSchema(gsmCells).omit({ cell_id: true });
const umtsCellsSchema = createSelectSchema(umtsCells).omit({ cell_id: true });
const lteCellsSchema = createSelectSchema(lteCells).omit({ cell_id: true });
const nrCellsSchema = createSelectSchema(nrCells).omit({ cell_id: true });
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();
const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({
      data: cellsSchema
        .extend({
          station: stationsSchema,
          band: bandsSchema,
        })
        .extend({ details: cellDetailsSchema }),
    }),
  },
};

type ResponseData = z.infer<typeof cellsSchema> & {
  station: z.infer<typeof stationsSchema>;
  band: z.infer<typeof bandsSchema>;
  details: z.infer<typeof cellDetailsSchema>;
};

type CellWithRat = z.infer<typeof cellsSchema> & {
  station: z.infer<typeof stationsSchema>;
  band: z.infer<typeof bandsSchema>;
  gsm?: z.infer<typeof gsmCellsSchema> | null;
  umts?: z.infer<typeof umtsCellsSchema> | null;
  lte?: z.infer<typeof lteCellsSchema> | null;
  nr?: z.infer<typeof nrCellsSchema> | null;
};

const cellByIdQuery = db.query.cells
  .findFirst({
    where: { id: sql.placeholder("id"), station: { status: "published" } },
    with: { station: true, band: true, gsm: true, umts: true, lte: true, nr: true },
  })
  .prepare("cell_by_id");

async function handler(req: FastifyRequest<IdParams>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { id } = req.params;

  const cell = await cellByIdQuery.execute({ id });
  if (!cell) throw new ErrorResponse("NOT_FOUND");

  const { gsm, umts, lte, nr, ...rest } = cell as CellWithRat;
  const featuresByStation = await getStationCountryFeatures([rest.station_id]);
  const features = featuresByStation.get(rest.station_id) ?? disabledCountryFeatures;
  const mapped: ResponseData = {
    ...rest,
    details: toLegacyCellDetails({ gsm, umts, lte, nr }, features),
  };

  return res.send({ data: mapped });
}

const getCell: Route<IdParams, ResponseData> = {
  url: "/cells/:id",
  method: "GET",
  config: { permissions: ["read:cells"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getCell;
