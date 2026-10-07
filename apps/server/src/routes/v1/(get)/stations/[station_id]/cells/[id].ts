import { bands, cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import { disabledCountryFeatures, getStationCountryFeatures } from "../../../../../../features/stations/countryFeatures.js";
import { toLegacyCellDetails } from "../../../../../../features/stations/serialize.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const cellsSchema = createSelectSchema(cells).omit({ band_id: true });
const bandsSchema = createSelectSchema(bands);
const gsmCellsSchema = createSelectSchema(gsmCells).omit({ cell_id: true });
const umtsCellsSchema = createSelectSchema(umtsCells).omit({ cell_id: true });
const lteCellsSchema = createSelectSchema(lteCells).omit({ cell_id: true });
const nrCellsSchema = createSelectSchema(nrCells).omit({ cell_id: true });
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();
const stationsSchema = createSelectSchema(stations);
type CellBase = z.infer<typeof cellsSchema>;
type CellDetails = z.infer<typeof cellDetailsSchema>;
type CellWithRats = CellBase & {
  band: z.infer<typeof bandsSchema>;
  gsm?: z.infer<typeof gsmCellsSchema>;
  umts?: z.infer<typeof umtsCellsSchema>;
  lte?: z.infer<typeof lteCellsSchema>;
  nr?: z.infer<typeof nrCellsSchema>;
};
type Cell = CellBase & { band: z.infer<typeof bandsSchema>; details: CellDetails };
const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
    cell_id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({
      data: cellsSchema.extend({ station: stationsSchema, band: bandsSchema, details: cellDetailsSchema }),
    }),
  },
};
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Cell>>) {
  const { station_id, cell_id } = req.params;

  const station = await db.query.stations.findFirst({
    where: {
      id: station_id,
      status: "published",
    },
  });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const cell = await db.query.cells.findFirst({
    where: {
      id: cell_id,
    },
    with: { band: true, gsm: true, umts: true, lte: true, nr: true },
    columns: { band_id: false },
  });
  if (!cell) throw new ErrorResponse("NOT_FOUND");
  if (cell.station_id !== station_id) throw new ErrorResponse("INVALID_QUERY", { message: "Requested cell does not belong to this station" });

  const { gsm, umts, lte, nr, ...rest } = cell as CellWithRats;
  const featuresByStation = await getStationCountryFeatures([station_id]);
  const features = featuresByStation.get(station_id) ?? disabledCountryFeatures;
  const details: CellDetails = toLegacyCellDetails({ gsm, umts, lte, nr }, features);
  return res.send({ data: { ...rest, details } as Cell });
}

const getCellFromStation: Route<ReqParams, Cell> = {
  url: "/stations/:station_id/cells/:cell_id",
  method: "GET",
  config: { permissions: ["read:stations", "read:cells"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getCellFromStation;
