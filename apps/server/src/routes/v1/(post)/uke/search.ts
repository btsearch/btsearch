import { operators, ukeLocations, ukeOperators, ukePermits, ukeRadiolines, ukeStations } from "@openbts/drizzle";
import { eq, ilike, or } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const operatorSchema = createSelectSchema(operators);
const ukeLocationSchema = createSelectSchema(ukeLocations).omit({ point: true });
const ukePermitSchema = createSelectSchema(ukePermits).omit({ uke_station_id: true });
const ukeOperatorSchema = createSelectSchema(ukeOperators);

const permitStationSchema = z.object({
  id: z.number(),
  station_id: z.string(),
  operator: operatorSchema.nullable(),
  location: ukeLocationSchema.nullable(),
  permits: z.array(ukePermitSchema),
});

const endpointSchema = z.object({ city: z.string().nullable(), latitude: z.number(), longitude: z.number() });

const radiolineResultSchema = z.object({
  id: z.number(),
  permit_number: z.string(),
  operator: ukeOperatorSchema.nullable(),
  tx: endpointSchema,
  rx: endpointSchema,
});

const schemaRoute = {
  body: z.object({
    query: z.string().min(1, "Query must not be empty"),
  }),
  response: {
    200: z.object({
      data: z.object({
        stations: z.array(permitStationSchema),
        radiolines: z.array(radiolineResultSchema),
      }),
    }),
  },
};

type ReqBody = { Body: { query: string } };
type ResponseBody = {
  data: {
    stations: z.infer<typeof permitStationSchema>[];
    radiolines: z.infer<typeof radiolineResultSchema>[];
  };
};

const LIMIT = 20;

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const { query } = req.body;
  if (!query?.trim()) throw new ErrorResponse("INVALID_QUERY");

  const like = `%${query}%`;

  const [matchingStationIds, radiolinesRes] = await Promise.all([
    db
      .selectDistinct({ id: ukeStations.id })
      .from(ukeStations)
      .innerJoin(ukePermits, eq(ukePermits.uke_station_id, ukeStations.id))
      .leftJoin(ukeLocations, eq(ukeStations.location_id, ukeLocations.id))
      .where(
        or(
          ilike(ukePermits.decision_number, like),
          ilike(ukeStations.station_id, like),
          ilike(ukeLocations.address, like),
          ilike(ukeLocations.city, like),
        ),
      )
      .limit(LIMIT),
    db
      .selectDistinctOn([ukeRadiolines.permit_number], {
        id: ukeRadiolines.id,
        permit_number: ukeRadiolines.permit_number,
        operator_id: ukeRadiolines.operator_id,
        tx_city: ukeRadiolines.tx_city,
        tx_latitude: ukeRadiolines.tx_latitude,
        tx_longitude: ukeRadiolines.tx_longitude,
        rx_city: ukeRadiolines.rx_city,
        rx_latitude: ukeRadiolines.rx_latitude,
        rx_longitude: ukeRadiolines.rx_longitude,
      })
      .from(ukeRadiolines)
      .where(ilike(ukeRadiolines.permit_number, like))
      .orderBy(ukeRadiolines.permit_number)
      .limit(LIMIT),
  ]);

  const stationIds = matchingStationIds.map((r) => r.id);

  const [allPermits, ukeOperatorRows] = await Promise.all([
    stationIds.length > 0
      ? db.query.ukePermits.findMany({
          where: { uke_station_id: { in: stationIds } },
          columns: { uke_station_id: false },
          with: {
            station: {
              columns: { operator_id: false, location_id: false },
              with: {
                operator: true,
                location: { columns: { point: false } },
              },
            },
          },
        })
      : [],
    radiolinesRes.length > 0
      ? db.query.ukeOperators.findMany({
          where: { id: { in: [...new Set(radiolinesRes.map((r) => r.operator_id).filter((id): id is number => id !== null))] } },
        })
      : [],
  ]);

  const ukeOperatorMap = new Map(ukeOperatorRows.map((o) => [o.id, o]));

  const stationMap = new Map<number, z.infer<typeof permitStationSchema>>();
  for (const permit of allPermits) {
    const { station: permitStation, ...permitData } = permit;
    let station = stationMap.get(permitStation.id);
    if (station === undefined) {
      station = {
        id: permitStation.id,
        station_id: permitStation.station_id,
        operator: permitStation.operator ?? null,
        location: permitStation.location ?? null,
        permits: [],
      };
      stationMap.set(permitStation.id, station);
    }
    station.permits.push(permitData);
  }

  const permits = stationIds.map((id) => stationMap.get(id)).filter((s): s is z.infer<typeof permitStationSchema> => s !== undefined);

  const radiolines = radiolinesRes.map((r) => ({
    id: r.id,
    permit_number: r.permit_number,
    operator: r.operator_id !== null ? (ukeOperatorMap.get(r.operator_id) ?? null) : null,
    tx: { city: r.tx_city, latitude: r.tx_latitude, longitude: r.tx_longitude },
    rx: { city: r.rx_city, latitude: r.rx_latitude, longitude: r.rx_longitude },
  }));

  return res.send({ data: { stations: permits, radiolines } });
}

const searchUkeRoute: Route<ReqBody, ResponseBody> = {
  url: "/uke/search",
  method: "POST",
  schema: schemaRoute,
  config: { permissions: ["read:uke_permits"], allowGuestAccess: true },
  handler,
};

export default searchUkeRoute;
