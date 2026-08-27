import {
  bands,
  cells,
  locations,
  operators,
  radioLinesManufacturers,
  radiolinesAntennaTypes,
  regions,
  stations,
  ukeLocations,
  ukePermitSectors,
  ukePermits,
  ukeStations,
  userLists,
} from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../plugins/auth/utils.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";

const ukePermitSectorResponseSchema = createSelectSchema(ukePermitSectors).omit({ permit_id: true });

const ukeStationPermitResponseSchema = createSelectSchema(ukePermits)
  .omit({ uke_station_id: true, band_id: true })
  .extend({
    band: createSelectSchema(bands).nullable(),
    sectors: z.array(ukePermitSectorResponseSchema).optional(),
  });
const ukeLocationStationResponseSchema = createSelectSchema(ukeStations)
  .omit({ operator_id: true, location_id: true })
  .extend({
    operator: createSelectSchema(operators).nullable(),
    permits: z.array(ukeStationPermitResponseSchema),
  });
const ukeLocationResponseSchema = createSelectSchema(ukeLocations)
  .omit({ point: true, region_id: true })
  .extend({
    region: createSelectSchema(regions),
    stations: z.array(ukeLocationStationResponseSchema),
  });

const manufacturerSchema = createSelectSchema(radioLinesManufacturers);
const equipmentTypeSchema = createSelectSchema(radiolinesAntennaTypes)
  .omit({ manufacturer_id: true })
  .extend({ manufacturer: manufacturerSchema.optional() });
const txSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
  height: z.number(),
  eirp: z.number().optional(),
  antenna_attenuation: z.number().optional(),
  transmitter: z.object({ type: equipmentTypeSchema.optional() }).optional(),
  antenna: z
    .object({
      type: equipmentTypeSchema.optional(),
      gain: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
});
const rxSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
  height: z.number(),
  type: equipmentTypeSchema.optional(),
  gain: z.number().optional(),
  height_antenna: z.number().optional(),
  noise_figure: z.number().optional(),
  atpc_attenuation: z.number().optional(),
});
const linkSchema = z.object({
  freq: z.number(),
  ch_num: z.number().optional(),
  plan_symbol: z.string().optional(),
  ch_width: z.number().optional(),
  polarization: z.string().optional(),
  modulation_type: z.string().optional(),
  bandwidth: z.string().optional(),
});
const operatorSchema = createSelectSchema(operators).extend({
  parent_id: z.number().nullable().optional(),
  mnc: z.number().nullable().optional(),
});
const regionSchema = createSelectSchema(regions);
const locationSchema = createSelectSchema(locations).omit({ point: true, region_id: true });
const bandsSchema = createSelectSchema(bands);
const cellsSchema = createSelectSchema(cells).omit({ band_id: true, station_id: true });
const stationsSchema = createSelectSchema(stations).omit({ status: true, operator_id: true, location_id: true });
const cellResponseSchema = cellsSchema.extend({ band: bandsSchema });
const stationResponseSchema = stationsSchema.extend({
  cells: z.array(cellResponseSchema),
  location: locationSchema.extend({ region: regionSchema }),
  operator: operatorSchema,
});
const radioLineResponseSchema = z.object({
  id: z.number(),
  tx: txSchema,
  rx: rxSchema,
  link: linkSchema,
  operator: operatorSchema.optional(),
  permit: z.object({
    number: z.string().optional(),
    decision_type: z.string().optional(),
    expiry_date: z.date(),
  }),
  updatedAt: z.date(),
  createdAt: z.date(),
});
type RadioLineResponse = z.infer<typeof radioLineResponseSchema>;

const schemaRoute = {
  params: z.object({
    uuid: z.string(),
  }),
  querystring: z.object({
    azimuths: z
      .string()
      .optional()
      .transform((val): boolean => val === "true" || val === "1"),
  }),
  response: {
    200: z.object({
      data: createSelectSchema(userLists)
        .omit({ created_by: true, stations: true, radiolines: true })
        .extend({
          stations: z.array(stationResponseSchema),
          radiolines: z.array(radioLineResponseSchema),
          ukeLocations: z.array(ukeLocationResponseSchema),
        }),
    }),
  },
};

type ReqParams = { Params: { uuid: string }; Querystring: { azimuths: boolean } };
type ResponseBody = z.infer<(typeof schemaRoute.response)["200"]>;

function mapType(t: { id: number; name: string; manufacturer: { id: number; name: string } | null } | null | undefined) {
  return t
    ? {
        id: t.id,
        name: t.name,
        manufacturer: t.manufacturer ? { id: t.manufacturer.id, name: t.manufacturer.name } : undefined,
      }
    : undefined;
}

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  if (!getRuntimeSettings().enableUserLists) throw new ErrorResponse("FORBIDDEN");

  const { uuid } = req.params;
  const { azimuths } = req.query;

  const list = await db.query.userLists.findFirst({
    where: { uuid },
  });
  if (!list) throw new ErrorResponse("NOT_FOUND");

  if (!list.is_public) {
    if (!req.userSession) throw new ErrorResponse("UNAUTHORIZED");
    const userId = req.userSession.user.id;
    const isAdmin = await verifyPermissions(userId, { user_lists: ["read"] });
    if (!isAdmin && userId !== list.created_by) throw new ErrorResponse("NOT_FOUND");
  }

  const stationsObj = (list.stations as { internal: number[]; uke: number[] }) ?? { internal: [], uke: [] };
  const stationIds = stationsObj.internal ?? [];
  const ukeStationIds = stationsObj.uke ?? [];
  const radiolineIds = (list.radiolines as number[]) ?? [];

  const [stationsData, radiolinesData, ukeStationsDataRaw] = await Promise.all([
    stationIds.length
      ? db.query.stations.findMany({
          columns: {
            status: false,
            operator_id: false,
            location_id: false,
          },
          with: {
            cells: {
              columns: { band_id: false },
              with: { band: true },
            },
            location: { columns: { point: false, region_id: false }, with: { region: true } },
            operator: true,
          },
          where: {
            id: { in: stationIds },
          },
        })
      : [],
    radiolineIds.length
      ? db.query.ukeRadiolines.findMany({
          columns: {
            operator_id: false,
          },
          with: {
            operator: true,
            txTransmitterType: { with: { manufacturer: true } },
            txAntennaType: { with: { manufacturer: true } },
            rxAntennaType: { with: { manufacturer: true } },
          },
          where: {
            id: { in: radiolineIds },
          },
        })
      : [],
    ukeStationIds.length
      ? db.query.ukeStations.findMany({
          columns: { operator_id: false, location_id: false },
          with: {
            operator: true,
            location: { columns: { point: false, region_id: false }, with: { region: true } },
            permits: {
              columns: { uke_station_id: false, band_id: false },
              with: {
                band: true,
                ...(azimuths ? { sectors: { columns: { permit_id: false } } } : {}),
              },
            },
          },
          where: { id: { in: ukeStationIds } },
        })
      : [],
  ]);

  type UkeStationRow = (typeof ukeStationsDataRaw)[number];
  const ukeLocationMap = new Map<number, UkeStationRow["location"] & { stations: Omit<UkeStationRow, "location">[] }>();
  for (const ukeStation of ukeStationsDataRaw) {
    const { location, ...stationData } = ukeStation;
    let entry = ukeLocationMap.get(location.id);
    if (!entry) {
      entry = { ...location, stations: [] };
      ukeLocationMap.set(location.id, entry);
    }
    entry.stations.push(stationData);
  }
  const ukeLocationsData = [...ukeLocationMap.values()];

  const mappedRadiolines: RadioLineResponse[] = radiolinesData.map((radioLine) => ({
    id: radioLine.id,
    tx: {
      longitude: radioLine.tx_longitude,
      latitude: radioLine.tx_latitude,
      height: radioLine.tx_height,
      eirp: radioLine.tx_eirp ?? undefined,
      antenna_attenuation: radioLine.tx_antenna_attenuation ?? undefined,
      transmitter: { type: mapType(radioLine.txTransmitterType) },
      antenna: {
        type: mapType(radioLine.txAntennaType),
        gain: radioLine.tx_antenna_gain ?? undefined,
        height: radioLine.tx_antenna_height ?? undefined,
      },
    },
    rx: {
      longitude: radioLine.rx_longitude,
      latitude: radioLine.rx_latitude,
      height: radioLine.rx_height,
      type: mapType(radioLine.rxAntennaType),
      gain: radioLine.rx_antenna_gain ?? undefined,
      height_antenna: radioLine.rx_antenna_height ?? undefined,
      noise_figure: radioLine.rx_noise_figure ?? undefined,
      atpc_attenuation: radioLine.rx_atpc_attenuation ?? undefined,
    },
    link: {
      freq: radioLine.freq,
      ch_num: radioLine.ch_num ?? undefined,
      plan_symbol: radioLine.plan_symbol ?? undefined,
      ch_width: radioLine.ch_width ?? undefined,
      polarization: radioLine.polarization ?? undefined,
      modulation_type: radioLine.modulation_type ?? undefined,
      bandwidth: radioLine.bandwidth ?? undefined,
    },
    operator: radioLine.operator ?? undefined,
    permit: {
      number: radioLine.permit_number ?? undefined,
      decision_type: radioLine.decision_type ?? undefined,
      expiry_date: radioLine.expiry_date,
    },
    updatedAt: radioLine.updatedAt,
    createdAt: radioLine.createdAt,
  }));

  return res.send({
    data: {
      id: list.id,
      uuid: list.uuid,
      name: list.name,
      description: list.description,
      is_public: list.is_public,
      notificationsEnabled: list.notificationsEnabled,
      stations: stationsData,
      radiolines: mappedRadiolines,
      ukeLocations: ukeLocationsData,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
    },
  });
}

const getListByUuid: Route<ReqParams, ResponseBody> = {
  url: "/lists/:uuid",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getListByUuid;
