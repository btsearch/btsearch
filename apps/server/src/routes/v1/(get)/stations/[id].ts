import {
  bands,
  cells,
  extraIdentificators,
  gsmCells,
  locations,
  lteCells,
  nrCells,
  operators,
  regions,
  stationSectors,
  stationUplinks,
  stations,
  umtsCells,
} from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { HIDDEN_STRUCTURE_COLUMNS, STRUCTURE_COLUMNS } from "../../../../features/locations/structure.js";
import { disabledCountryFeatures, getStationCountryFeatures } from "../../../../features/stations/countryFeatures.js";
import { findPhysicalStation, physicalStationSchema } from "../../../../features/stations/physicalStations.js";
import { toLegacyCellDetails } from "../../../../features/stations/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { IdParams, JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const stationSchema = createSelectSchema(stations)
  .omit({ status: true, operator_id: true, location_id: true })
  .extend({ status: z.enum(["published", "inactive", "pending"]).optional() });
const cellsSchema = createSelectSchema(cells).omit({ band_id: true, station_id: true });
const bandsSchema = createSelectSchema(bands);
const regionSchema = createSelectSchema(regions);
const gsmCellsSchema = createSelectSchema(gsmCells).omit({ cell_id: true });
const umtsCellsSchema = createSelectSchema(umtsCells).omit({ cell_id: true });
const lteCellsSchema = createSelectSchema(lteCells).omit({ cell_id: true });
const nrCellsSchema = createSelectSchema(nrCells).omit({ cell_id: true });
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();
const locationSchema = createSelectSchema(locations).omit({ point: true, region_id: true, ...STRUCTURE_COLUMNS });
const operatorSchema = createSelectSchema(operators);
const extraIdentificatorsSchema = createSelectSchema(extraIdentificators).omit({ station_id: true });
const sectorsSchema = createSelectSchema(stationSectors).omit({ station_id: true });
const uplinkSchema = createSelectSchema(stationUplinks).omit({ station_id: true });
type StationBase = z.infer<typeof stationSchema>;
type CellDetails = z.infer<typeof cellDetailsSchema>;
type CellWithRats = z.infer<typeof cellsSchema> & {
  band: z.infer<typeof bandsSchema>;
  gsm?: z.infer<typeof gsmCellsSchema>;
  umts?: z.infer<typeof umtsCellsSchema>;
  lte?: z.infer<typeof lteCellsSchema>;
  nr?: z.infer<typeof nrCellsSchema>;
};
type CellResponse = z.infer<typeof cellsSchema> & { band: z.infer<typeof bandsSchema>; details: CellDetails };
type StationResponse = StationBase & {
  cells: CellResponse[];
  location: z.infer<typeof locationSchema>;
  operator: z.infer<typeof operatorSchema>;
  extra_identificators?: z.infer<typeof extraIdentificatorsSchema>;
  physicalStation?: z.infer<typeof physicalStationSchema>;
};
const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({
      data: stationSchema.extend({
        cells: z.array(cellsSchema.extend({ band: bandsSchema, details: cellDetailsSchema })),
        location: locationSchema.extend({ region: regionSchema }),
        operator: operatorSchema,
        extra_identificators: extraIdentificatorsSchema.optional(),
        sectors: z.array(sectorsSchema).optional(),
        uplink: uplinkSchema.optional(),
        physicalStation: physicalStationSchema.optional(),
      }),
    }),
  },
};

async function handler(req: FastifyRequest<IdParams>, res: ReplyPayload<JSONBody<StationResponse>>) {
  const { id } = req.params;

  const station = await db.query.stations.findFirst({
    where: { id },
    with: {
      cells: { with: { band: true, gsm: true, umts: true, lte: true, nr: true }, columns: { band_id: false, station_id: false } },
      location: { columns: { point: false, region_id: false, ...HIDDEN_STRUCTURE_COLUMNS }, with: { region: true } },
      operator: true,
      extra_identificators: { columns: { station_id: false } },
      sectors: {
        columns: { station_id: false },
        orderBy: { id: "asc" },
      },
      uplink: { columns: { station_id: false } },
    },
    columns: { operator_id: false, location_id: false },
  });

  if (!station) throw new ErrorResponse("NOT_FOUND");

  const [physicalStation, featuresByStation] = await Promise.all([
    findPhysicalStation(station.id, station.location?.id, station.operator?.mnc),
    getStationCountryFeatures(station.cells.length > 0 ? [station.id] : []),
  ]);
  const features = featuresByStation.get(station.id) ?? disabledCountryFeatures;

  const cells: CellResponse[] = (station.cells as CellWithRats[]).map((cell) => {
    const { gsm, umts, lte, nr, band, ...rest } = cell;
    const details: CellDetails = toLegacyCellDetails({ gsm, umts, lte, nr }, features);
    return { ...rest, band, details };
  });

  const data = { ...station, cells } as StationResponse & { extra_identificators?: z.infer<typeof extraIdentificatorsSchema> | null };
  if (!data.extra_identificators) delete (data as { extra_identificators?: unknown }).extra_identificators;
  if (!(data as { uplink?: unknown }).uplink) delete (data as { uplink?: unknown }).uplink;
  if (physicalStation) data.physicalStation = physicalStation;

  return res.send({ data });
}

const getStation: Route<IdParams, StationResponse> = {
  url: "/stations/:id",
  method: "GET",
  config: { permissions: ["read:stations"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStation;
