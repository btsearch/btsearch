import { bands, operators, regions, ukeLocations, ukePermitSectors, ukePermits, ukeStations } from "@openbts/drizzle";
import { type SQL, and, count, eq, inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import redis from "../../../../../database/redis.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const ukeStationsSchema = createSelectSchema(ukeStations)
  .omit({ operator_id: true, location_id: true })
  .extend({ createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) });
const ukeLocationsSchema = createSelectSchema(ukeLocations)
  .omit({ point: true, region_id: true })
  .extend({ createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) });
const ukePermitsSchema = createSelectSchema(ukePermits)
  .omit({ uke_station_id: true, band_id: true })
  .extend({
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    expiry_date: z.iso.datetime({ offset: true }),
  });
const bandsSchema = createSelectSchema(bands);
const operatorsSchema = createSelectSchema(operators);
const regionsSchema = createSelectSchema(regions);
const sectorsSchema = createSelectSchema(ukePermitSectors).omit({ permit_id: true }).extend({ antenna_height: z.number().nullable() });

const permitResponseSchema = ukePermitsSchema.extend({
  band: bandsSchema.nullable(),
  sectors: z.array(sectorsSchema),
});

const stationResponseSchema = ukeStationsSchema.extend({
  operator: operatorsSchema,
  location: ukeLocationsSchema.extend({ region: regionsSchema }),
  permits: z.array(permitResponseSchema),
});

const responseSchema = z.object({
  data: z.array(stationResponseSchema),
  totalCount: z.number(),
});

const schemaRoute = {
  querystring: z.object({
    bounds: z
      .string()
      .regex(/^-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*$/)
      .optional()
      .transform((val): number[] | undefined => (val ? val.split(",").map(Number) : undefined)),
    limit: z.coerce.number().min(1).max(1000).optional().default(500),
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
    since: z
      .string()
      .regex(/^(createdAt|updatedAt)(?:,(createdAt|updatedAt))?:\d+$/)
      .optional()
      .transform((val) => {
        if (!val) return null;
        const lastIndex = val.lastIndexOf(":");
        const fields = val.slice(0, lastIndex).split(",") as ("createdAt" | "updatedAt")[];
        const days = Number(val.slice(lastIndex + 1));
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return { fields, cutoff };
      }),
    station_id: z.string().optional(),
  }),
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type StationData = z.infer<typeof stationResponseSchema>;
type ResponseBody = z.infer<typeof responseSchema>;

const CACHE_TTL = 30;

function iso(date: Date): string {
  return date.toISOString();
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const cacheKey = `uke:stations:${JSON.stringify(req.query)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached));

  const { bounds, limit, page, rat, operators: operatorMncs, bands: bandValues, since, station_id } = req.query;
  const offset = (page - 1) * limit;
  const expandedOperatorMncs = operatorMncs?.includes(26034) ? [...new Set([...operatorMncs, 26002, 26003])] : operatorMncs;

  let envelope: ReturnType<typeof sql> | undefined;
  if (bounds) {
    const [la1, lo1, la2, lo2] = bounds as [number, number, number, number];
    const [west, south] = [Math.min(lo1, lo2), Math.min(la1, la2)];
    const [east, north] = [Math.max(lo1, lo2), Math.max(la1, la2)];
    envelope = sql`ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`;
  }

  const requestedRats = rat ?? [];
  type RatType = "GSM" | "UMTS" | "LTE" | "NR" | "CDMA" | "IOT";
  const ratMap: Record<string, RatType> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR", cdma: "CDMA", iot: "IOT" } as const;
  const wantsGsmR = requestedRats.includes("gsm-r");
  const standardRats = requestedRats.filter((r) => r !== "gsm-r");
  const mappedRats: RatType[] = standardRats.map((r) => ratMap[r]).filter((r): r is RatType => r !== undefined);

  const bandConditions: SQL<unknown>[] = [];
  if (bandValues?.length) bandConditions.push(inArray(bands.value, bandValues));
  if (mappedRats.length || wantsGsmR) {
    const ratConds: SQL<unknown>[] = [];
    if (mappedRats.length) {
      const wantsRegularGsm = mappedRats.includes("GSM");
      const nonGsmRats = mappedRats.filter((r) => r !== "GSM");
      if (nonGsmRats.length) ratConds.push(inArray(bands.rat, nonGsmRats));
      if (wantsRegularGsm) ratConds.push(sql`(${bands.rat} = 'GSM' AND ${bands.variant} = 'commercial')`);
    }
    if (wantsGsmR) ratConds.push(sql`(${bands.rat} = 'GSM' AND ${bands.variant} = 'railway')`);
    if (ratConds.length) bandConditions.push(sql`(${sql.join(ratConds, sql` OR `)})`);
  }
  const hasBandFilters = bandConditions.length > 0;

  const [eligibleBandRows, operatorRows, boundaryLocations] = await Promise.all([
    hasBandFilters
      ? db
          .select({ id: bands.id })
          .from(bands)
          .where(and(...bandConditions))
      : [],
    expandedOperatorMncs?.length ? db.query.operators.findMany({ columns: { id: true }, where: { mnc: { in: expandedOperatorMncs } } }) : [],
    envelope
      ? db
          .select({ id: ukeLocations.id })
          .from(ukeLocations)
          .where(sql`ST_Intersects(${ukeLocations.point}, ${envelope})`)
      : undefined,
  ]);

  const eligibleBandIds = eligibleBandRows.map((b) => b.id);
  const operatorIds = operatorRows.map((r) => r.id);
  const locationIds = boundaryLocations?.map((loc) => loc.id);

  if (hasBandFilters && !eligibleBandIds.length) return res.send({ data: [], totalCount: 0 });
  if (operatorMncs?.length && !operatorIds.length) return res.send({ data: [], totalCount: 0 });
  if (boundaryLocations && !locationIds?.length) return res.send({ data: [], totalCount: 0 });

  const buildStationConditions = (fields: typeof ukeStations): SQL<unknown>[] => {
    const conditions: SQL<unknown>[] = [];
    if (locationIds) conditions.push(inArray(fields.location_id, locationIds));
    if (operatorIds.length) conditions.push(inArray(fields.operator_id, operatorIds));
    if (station_id) conditions.push(eq(fields.station_id, station_id));
    if (since !== null) {
      const parts = since.fields.map((field) =>
        field === "createdAt" ? sql`${fields.createdAt} >= ${since.cutoff}` : sql`${fields.updatedAt} >= ${since.cutoff}`,
      );
      conditions.push(parts.length > 1 ? sql`(${sql.join(parts, sql` OR `)})` : parts[0]!);
    }
    if (eligibleBandIds.length) {
      conditions.push(sql`EXISTS (
        SELECT 1
        FROM ${ukePermits}
        WHERE ${ukePermits.uke_station_id} = ${fields.id}
          AND ${inArray(ukePermits.band_id, eligibleBandIds)}
      )`);
    }
    return conditions;
  };

  const buildPermitConditions = (fields: typeof ukePermits): SQL<unknown>[] => {
    const conditions: SQL<unknown>[] = [];
    if (eligibleBandIds.length) conditions.push(inArray(fields.band_id, eligibleBandIds));
    return conditions;
  };

  try {
    const stationConditions = buildStationConditions(ukeStations);
    const stationWhere = stationConditions.length ? and(...stationConditions) : undefined;

    const [countRows, stationsRows] = await Promise.all([
      db.select({ count: count() }).from(ukeStations).where(stationWhere),
      db.query.ukeStations.findMany({
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
          permits: {
            columns: {
              uke_station_id: false,
              band_id: false,
            },
            with: {
              band: true,
              sectors: {
                columns: {
                  permit_id: false,
                },
              },
            },
            where: {
              RAW: (fields) => {
                const permitConditions = buildPermitConditions(fields);
                return permitConditions.length ? (and(...permitConditions) ?? sql`true`) : sql`true`;
              },
            },
          },
        },
        where: {
          RAW: (fields) => {
            const conditions = buildStationConditions(fields);
            return conditions.length ? (and(...conditions) ?? sql`true`) : sql`true`;
          },
        },
        orderBy: { updatedAt: "desc" },
        limit,
        offset,
      }),
    ]);

    const data = stationsRows.map((station) => ({
      ...station,
      createdAt: iso(station.createdAt),
      updatedAt: iso(station.updatedAt),
      location: {
        ...station.location,
        createdAt: iso(station.location.createdAt),
        updatedAt: iso(station.location.updatedAt),
      },
      permits: station.permits.map((permit) => ({
        ...permit,
        expiry_date: iso(permit.expiry_date),
        createdAt: iso(permit.createdAt),
        updatedAt: iso(permit.updatedAt),
      })),
    })) satisfies StationData[];

    const totalCount = countRows[0]?.count ?? 0;
    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify({ data, totalCount }));
    return res.send({ data, totalCount });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", {
      message: error instanceof Error ? error.message : "Unknown error",
      cause: error,
    });
  }
}

const getUkeStations: Route<ReqQuery, ResponseBody> = {
  url: "/uke/stations",
  method: "GET",
  config: { permissions: ["read:uke_permits"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getUkeStations;
