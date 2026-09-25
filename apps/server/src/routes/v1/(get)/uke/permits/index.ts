import { bands, operators, regions, ukeLocations, ukePermitSectors, ukePermits, ukeStations } from "@openbts/drizzle";
import { ukePermitsResponseType } from "@openbts/proto/server";
import { type SQL, and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const ukePermitsSchema = createSelectSchema(ukePermits).omit({ band_id: true, uke_station_id: true });
const ukeLocationsSchema = createSelectSchema(ukeLocations).omit({ point: true, region_id: true });
const ukeStationsSchema = createSelectSchema(ukeStations).omit({ operator_id: true, location_id: true });
const bandsSchema = createSelectSchema(bands);
const operatorsSchema = createSelectSchema(operators);
const regionsSchema = createSelectSchema(regions);
const sectorsSchema = createSelectSchema(ukePermitSectors).omit({ permit_id: true });
const schemaRoute = {
  querystring: z.object({
    bounds: z
      .string()
      .regex(/^-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+$/)
      .optional()
      .transform((val): number[] | undefined => (val ? val.split(",").map(Number) : undefined)),
    limit: z.coerce.number().min(1).optional().default(150),
    page: z.coerce.number().min(1).default(1),
    rat: z
      .string()
      .regex(/^(?:cdma|umts|gsm|gsm-r|lte|nr|iot)(?:,(?:cdma|umts|gsm|gsm-r|lte|nr|iot))*$/i)
      .optional()
      .transform((val): string[] | undefined => (val ? val.toLowerCase().split(",").filter(Boolean) : undefined)),
    operators: z
      .string()
      .regex(/^\d+(,\d+)*$/)
      .optional()
      .transform((val): number[] | undefined =>
        val
          ? val
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          : undefined,
      ),
    bands: z
      .string()
      .regex(/^\d+(,\d+)*$/)
      .optional()
      .transform((val): number[] | undefined =>
        val
          ? val
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          : undefined,
      ),
    decisionType: z.literal(["zmP", "P"]).optional(),
    decision_number: z.string().optional(),
    station_id: z.string().optional(),
    operator: z.coerce.number().optional(),
  }),
  response: {
    200: z.object({
      data: z.array(
        ukePermitsSchema.extend({
          band: bandsSchema,
          station: ukeStationsSchema.extend({
            operator: operatorsSchema,
            location: ukeLocationsSchema.extend({ region: regionsSchema }),
          }),
          sectors: z.array(sectorsSchema).optional(),
        }),
      ),
    }),
  },
};
type ReqQuery = {
  Querystring: z.infer<typeof schemaRoute.querystring>;
};
type Permit = z.infer<typeof ukePermitsSchema> & {
  band?: z.infer<typeof bandsSchema>;
  station?: z.infer<typeof ukeStationsSchema> & {
    operator: z.infer<typeof operatorsSchema>;
    location: z.infer<typeof ukeLocationsSchema> & { region: z.infer<typeof regionsSchema> };
  };
  sectors?: z.infer<typeof sectorsSchema>[];
};

const SIMILARITY_THRESHOLD = 0.6;

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<Permit[]>>) {
  const {
    limit,
    page,
    bounds,
    rat,
    bands: bandValues,
    decisionType,
    decision_number,
    station_id,
    operator: operatorMnc,
    operators: operatorMncs,
  } = req.query;
  const offset = (page - 1) * limit;

  try {
    let envelope: ReturnType<typeof sql> | undefined;
    if (bounds) {
      const [la1, lo1, la2, lo2] = bounds as [number, number, number, number];
      const [west, south] = [Math.min(lo1, lo2), Math.min(la1, la2)];
      const [east, north] = [Math.max(lo1, lo2), Math.max(la1, la2)];
      envelope = sql`ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`;
    }

    const expandedOperatorMncs = operatorMncs?.includes(26034) ? [...new Set([...operatorMncs, 26002, 26003])] : operatorMncs;

    const [bandRows, boundaryLocations, operatorRow, operatorRows] = await Promise.all([
      bandValues
        ? db.query.bands.findMany({
            columns: { id: true },
            where: { value: { in: bandValues } },
          })
        : [],
      envelope
        ? db
            .select({ id: ukeLocations.id })
            .from(ukeLocations)
            .where(sql`ST_Intersects(${ukeLocations.point}, ${envelope})`)
        : undefined,
      operatorMnc !== undefined ? db.query.operators.findFirst({ columns: { id: true }, where: { mnc: operatorMnc } }) : undefined,
      expandedOperatorMncs?.length ? db.query.operators.findMany({ columns: { id: true }, where: { mnc: { in: expandedOperatorMncs } } }) : [],
    ]);

    const bandIds = bandRows.length ? bandRows.map((band) => band.id) : undefined;
    if (bandValues && !bandIds?.length) return res.send({ data: [] });

    const locationIds = boundaryLocations?.map((loc) => loc.id);
    if (boundaryLocations && !locationIds?.length) return res.send({ data: [] });

    const operatorId = operatorRow?.id;
    if (operatorMnc !== undefined && !operatorId) return res.send({ data: [] });
    const operatorIds = [...new Set([...(operatorId ? [operatorId] : []), ...operatorRows.map((row) => row.id)])];
    if (operatorMncs?.length && !operatorIds.length) return res.send({ data: [] });

    const ukePermitsRes = await db.query.ukePermits.findMany({
      columns: {
        band_id: false,
        uke_station_id: false,
      },
      with: {
        band: true,
        station: {
          columns: {
            operator_id: false,
            location_id: false,
          },
          with: {
            operator: true,
            location: {
              columns: {
                point: false,
                region_id: false,
              },
              with: {
                region: true,
              },
            },
          },
        },
        sectors: {
          columns: {
            permit_id: false,
          },
        },
      },
      where: {
        RAW: (fields) => {
          const conditions: (SQL<unknown> | undefined)[] = [];
          if (bandIds && bandIds.length > 0) conditions.push(inArray(fields.band_id, bandIds));
          if (decisionType) conditions.push(eq(fields.decision_type, decisionType));
          if (decision_number) {
            const like = `%${decision_number}%`;
            conditions.push(
              or(ilike(fields.decision_number, like), sql`similarity(${fields.decision_number}, ${decision_number}) > ${SIMILARITY_THRESHOLD}`),
            );
          }
          const stationConditions: SQL<unknown>[] = [];
          if (locationIds) stationConditions.push(inArray(ukeStations.location_id, locationIds));
          if (station_id) stationConditions.push(eq(ukeStations.station_id, station_id));
          if (operatorIds.length) stationConditions.push(inArray(ukeStations.operator_id, operatorIds));
          if (stationConditions.length) {
            conditions.push(
              sql`EXISTS (SELECT 1 FROM ${ukeStations} WHERE ${ukeStations.id} = ${fields.uke_station_id} AND ${and(...stationConditions)})`,
            );
          }
          if (rat) {
            const ratMap: Record<string, string> = { gsm: "GSM", "gsm-r": "GSM", umts: "UMTS", lte: "LTE", nr: "NR", cdma: "CDMA", iot: "IOT" };
            const wantsGsmR = rat.includes("gsm-r");
            const wantsGsm = rat.includes("gsm");
            const standardRats = rat.filter((r) => r !== "gsm" && r !== "gsm-r");
            const mappedRats = standardRats.map((r) => ratMap[r]).filter((r): r is string => r !== undefined);

            const ratConditions: SQL<unknown>[] = [];
            if (mappedRats.length) {
              ratConditions.push(
                sql`(${bands.rat} IN (${sql.join(
                  mappedRats.map((r) => sql`${r}`),
                  sql`,`,
                )}))`,
              );
            }
            if (wantsGsm) ratConditions.push(sql`(${bands.rat} = 'GSM' AND ${bands.variant} = 'commercial')`);
            if (wantsGsmR) ratConditions.push(sql`(${bands.rat} = 'GSM' AND ${bands.variant} = 'railway')`);

            if (ratConditions.length) {
              conditions.push(sql`EXISTS (SELECT 1 FROM ${bands} WHERE ${bands.id} = ${fields.band_id} AND (${sql.join(ratConditions, sql` OR `)}))`);
            }
          }
          return conditions.length > 0 ? (and(...conditions) ?? sql`true`) : sql`true`;
        },
      },
      limit,
      offset,
    });

    return res.send({ data: ukePermitsRes });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", {
      message: error instanceof Error ? error.message : "Unknown error",
      cause: error,
    });
  }
}

const getUkePermits: Route<ReqQuery, Permit[]> = {
  url: "/uke/permits",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read:uke_permits"], allowGuestAccess: true, proto: ukePermitsResponseType },
  handler,
};

export default getUkePermits;
