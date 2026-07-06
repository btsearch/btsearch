import { bands, operators, regions, ukeLocations, ukePermitSectors, ukePermits, ukeStations } from "@openbts/drizzle";
import { ukeLocationsResponseType } from "@openbts/proto/server";
import { type SQL, and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import redis from "../../../../../database/redis.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

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
const ukeStationsSchema = createSelectSchema(ukeStations)
  .omit({ operator_id: true, location_id: true })
  .extend({ createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) });
const ukePermitSectorsSchema = createSelectSchema(ukePermitSectors).omit({ permit_id: true });
const bandsSchema = createSelectSchema(bands);
const operatorsSchema = createSelectSchema(operators);
const regionsSchema = createSelectSchema(regions);

const stationPermitResponseSchema = ukePermitsSchema.extend({
  band: bandsSchema.nullable(),
  sectors: z.array(ukePermitSectorsSchema).optional(),
});

const stationResponseSchema = ukeStationsSchema.extend({
  operator: operatorsSchema.nullable(),
  permits: z.array(stationPermitResponseSchema),
});

const responseSchema = z.object({
  data: z.array(
    ukeLocationsSchema.extend({
      region: regionsSchema,
      stations: z.array(stationResponseSchema),
    }),
  ),
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
    regions: z
      .string()
      .regex(/^[A-Z]{3}(,[A-Z]{3})*$/)
      .optional()
      .transform((val): string[] | undefined => (val ? val.split(",").filter(Boolean) : undefined)),
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
    azimuths: z
      .string()
      .optional()
      .transform((val): boolean => val === "true" || val === "1"),
  }),
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type StationData = z.infer<typeof stationResponseSchema>;
type ResponseData = z.infer<typeof ukeLocationsSchema> & { region: z.infer<typeof regionsSchema>; stations: StationData[] };
type ResponseBody = z.infer<typeof responseSchema>;

const CACHE_TTL = 30;

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const { bounds, limit, page, rat, operators: operatorMncs, bands: bandValues, regions: regionNames, since, azimuths } = req.query;

  const cacheKey = `uke:loc:${JSON.stringify({
    bounds: bounds ?? null,
    limit,
    page,
    rat: rat ? [...rat].sort() : null,
    operators: operatorMncs ? [...operatorMncs].sort((a, b) => a - b) : null,
    bands: bandValues ? [...bandValues].sort((a, b) => a - b) : null,
    regions: regionNames ? [...regionNames].sort() : null,
    since: since ? `${[...since.fields].sort().join(",")}:${since.cutoff.toISOString()}` : null,
    azimuths,
  })}`;
  const cached = await redis.get(cacheKey);

  if (cached) return res.send(JSON.parse(cached));

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

  const [eligibleBandRows, operatorRows, regionsRows] = await Promise.all([
    hasBandFilters
      ? db
          .select({ id: bands.id })
          .from(bands)
          .where(and(...bandConditions))
      : [],
    expandedOperatorMncs?.length
      ? db.query.operators.findMany({
          columns: { id: true },
          where: { mnc: { in: expandedOperatorMncs } },
        })
      : [],
    regionNames?.length
      ? db.query.regions.findMany({
          columns: { id: true },
          where: { code: { in: regionNames } },
        })
      : [],
  ]);

  const eligibleBandIds = eligibleBandRows.map((b) => b.id);
  const operatorIds = operatorRows.map((r) => r.id);
  const regionIds = regionsRows.map((r) => r.id);
  if (hasBandFilters && !eligibleBandIds.length) return res.send({ data: [], totalCount: 0 });

  const hasPermitFilters = operatorIds.length > 0 || eligibleBandIds.length > 0;

  const buildCreatedSinceCondition = (cutoff: Date): SQL<unknown> =>
    sql`${ukePermits.uke_station_id} NOT IN (SELECT ${ukePermits.uke_station_id} FROM ${ukePermits} WHERE ${ukePermits.createdAt} < ${cutoff.toISOString()})`;

  const buildUpdatedSinceCondition = (cutoff: Date): SQL<unknown> =>
    sql`${ukePermits.uke_station_id} IN (SELECT ${ukePermits.uke_station_id} FROM ${ukePermits} WHERE ${ukePermits.updatedAt} >= ${cutoff.toISOString()})`;

  const buildSinceCondition = (): SQL<unknown> | null => {
    if (since === null) return null;
    const parts = since.fields.map((field) => {
      if (field === "createdAt") return buildCreatedSinceCondition(since.cutoff);
      return buildUpdatedSinceCondition(since.cutoff);
    });
    return parts.length > 1 ? sql`(${sql.join(parts, sql` OR `)})` : parts[0]!;
  };

  const sinceCondition = buildSinceCondition();

  const buildStationFilterCondition = (locationIdCol: typeof ukeLocations.id): SQL<unknown> => {
    const conditions: SQL<unknown>[] = [eq(ukeStations.location_id, locationIdCol)];
    if (operatorIds.length) conditions.push(inArray(ukeStations.operator_id, operatorIds));
    return and(...conditions)!;
  };

  const buildPermitFilterCondition = (): SQL<unknown> => {
    const stationCondition = eq(ukePermits.uke_station_id, ukeStations.id);
    const conditions: SQL<unknown>[] = [stationCondition];
    if (eligibleBandIds.length) conditions.push(inArray(ukePermits.band_id, eligibleBandIds));
    if (sinceCondition !== null) conditions.push(sinceCondition);
    return and(...conditions)!;
  };

  const buildMatchingLocationCondition = (): SQL<unknown> => {
    const conditions: SQL<unknown>[] = [];
    if (operatorIds.length) conditions.push(inArray(ukeStations.operator_id, operatorIds));
    if (eligibleBandIds.length) conditions.push(inArray(ukePermits.band_id, eligibleBandIds));
    if (sinceCondition !== null) conditions.push(sinceCondition);
    return and(...conditions) ?? sql`true`;
  };

  const buildLocationOnlyConditions = (locFields: typeof ukeLocations): SQL<unknown>[] => {
    const conditions: SQL<unknown>[] = [];
    if (envelope) conditions.push(sql`${locFields.point} && ${envelope}`);
    if (regionIds.length) conditions.push(inArray(locFields.region_id, regionIds));
    return conditions;
  };

  try {
    const locationConditions = buildLocationOnlyConditions(ukeLocations);
    const locationWhereClause = locationConditions.length ? and(...locationConditions) : undefined;
    const needsPermitLocationFilter = hasPermitFilters || since !== null;
    const matchingLocations = needsPermitLocationFilter
      ? db
          .select({ id: ukeStations.location_id })
          .from(ukeStations)
          .innerJoin(ukePermits, eq(ukePermits.uke_station_id, ukeStations.id))
          .where(buildMatchingLocationCondition())
          .groupBy(ukeStations.location_id)
          .as("matching_locations")
      : null;

    const stationJoinCondition = buildStationFilterCondition(ukeLocations.id);
    const permitJoinCondition = buildPermitFilterCondition();

    const sectorsSubquery = azimuths
      ? sql`(SELECT COALESCE(json_agg(json_build_object(
            'id', s.id,
            'azimuth', s.azimuth,
            'elevation', s.elevation,
            'antenna_height', s.antenna_height,
            'antenna_type', s.antenna_type
          ) ORDER BY s.id), '[]'::json)
          FROM ${ukePermitSectors} s WHERE s.permit_id = ${ukePermits.id})`
      : null;

    const permitObject = azimuths
      ? sql`json_build_object(
            'id',              ${ukePermits.id},
            'decision_number', ${ukePermits.decision_number},
            'decision_type',   ${ukePermits.decision_type},
            'expiry_date',     ${ukePermits.expiry_date},
            'source',          ${ukePermits.source},
            'createdAt',       ${ukePermits.createdAt},
            'updatedAt',       ${ukePermits.updatedAt},
            'band', json_build_object(
              'id',      ${bands.id},
              'value',   ${bands.value},
              'rat',     ${bands.rat},
              'name',    ${bands.name},
              'duplex',  ${bands.duplex},
              'variant', ${bands.variant}
            ),
            'sectors', ${sectorsSubquery}
          )`
      : sql`json_build_object(
            'id',              ${ukePermits.id},
            'decision_number', ${ukePermits.decision_number},
            'decision_type',   ${ukePermits.decision_type},
            'expiry_date',     ${ukePermits.expiry_date},
            'source',          ${ukePermits.source},
            'createdAt',       ${ukePermits.createdAt},
            'updatedAt',       ${ukePermits.updatedAt},
            'band', json_build_object(
              'id',      ${bands.id},
              'value',   ${bands.value},
              'rat',     ${bands.rat},
              'name',    ${bands.name},
              'duplex',  ${bands.duplex},
              'variant', ${bands.variant}
            )
          )`;

    const pageLocationsSelection = { id: ukeLocations.id, totalCount: sql<number>`count(*) over()`.as("total_count") };
    const pageLocationsCte = db
      .$with("page_locations")
      .as(
        matchingLocations !== null
          ? db
              .select(pageLocationsSelection)
              .from(ukeLocations)
              .innerJoin(matchingLocations, eq(matchingLocations.id, ukeLocations.id))
              .where(locationWhereClause)
              .orderBy(desc(ukeLocations.id))
              .limit(limit)
              .offset(offset)
          : db
              .select(pageLocationsSelection)
              .from(ukeLocations)
              .where(locationWhereClause)
              .orderBy(desc(ukeLocations.id))
              .limit(limit)
              .offset(offset),
      );

    const stationRows = db
      .select({
        id: ukeStations.id,
        locationId: ukeStations.location_id,
        station: sql<StationData>`json_build_object(
          'id',         ${ukeStations.id},
          'station_id', ${ukeStations.station_id},
          'createdAt',  ${ukeStations.createdAt},
          'updatedAt',  ${ukeStations.updatedAt},
          'operator', CASE
            WHEN ${operators.id} IS NULL THEN NULL
            ELSE json_build_object(
              'id',        ${operators.id},
              'name',      ${operators.name},
              'full_name', ${operators.full_name},
              'parent_id', ${operators.parent_id},
              'mnc',       ${operators.mnc}
            )
          END,
          'permits', COALESCE(
            json_agg(${permitObject} ORDER BY ${ukePermits.id})
              FILTER (WHERE ${ukePermits.id} IS NOT NULL),
            '[]'::json
          )
        )`.as("station"),
      })
      .from(pageLocationsCte)
      .innerJoin(ukeLocations, eq(ukeLocations.id, pageLocationsCte.id))
      .innerJoin(ukeStations, stationJoinCondition)
      .innerJoin(ukePermits, permitJoinCondition)
      .leftJoin(bands, eq(bands.id, ukePermits.band_id))
      .leftJoin(operators, eq(operators.id, ukeStations.operator_id))
      .groupBy(ukeStations.id, operators.id)
      .as("station_rows");

    const stationsAgg = sql<StationData[]>`
      COALESCE(
        json_agg(${stationRows.station} ORDER BY ${stationRows.id})
          FILTER (WHERE ${stationRows.id} IS NOT NULL),
        '[]'::json
      )`;

    const runFallbackCountQuery = async (): Promise<number> => {
      if (matchingLocations !== null) {
        const result = await db
          .select({ count: count() })
          .from(ukeLocations)
          .innerJoin(matchingLocations, eq(matchingLocations.id, ukeLocations.id))
          .where(locationWhereClause);
        return result[0]?.count ?? 0;
      }
      if (!locationConditions.length) {
        const result = await db.select({ count: count() }).from(ukeLocations);
        return result[0]?.count ?? 0;
      }
      const result = await db.select({ count: count() }).from(ukeLocations).where(locationWhereClause);
      return result[0]?.count ?? 0;
    };

    const rows = await db
      .with(pageLocationsCte)
      .select({
        id: ukeLocations.id,
        city: ukeLocations.city,
        address: ukeLocations.address,
        longitude: ukeLocations.longitude,
        latitude: ukeLocations.latitude,
        createdAt: ukeLocations.createdAt,
        updatedAt: ukeLocations.updatedAt,
        totalCount: sql<number>`max(${pageLocationsCte.totalCount})`.mapWith(Number),
        region: sql<z.infer<typeof regionsSchema>>`json_build_object(
          'id',   ${regions.id},
          'name', ${regions.name},
          'code', ${regions.code}
        )`,
        stations: stationsAgg,
      })
      .from(pageLocationsCte)
      .innerJoin(ukeLocations, eq(ukeLocations.id, pageLocationsCte.id))
      .innerJoin(regions, eq(regions.id, ukeLocations.region_id))
      .leftJoin(stationRows, eq(stationRows.locationId, ukeLocations.id))
      .groupBy(ukeLocations.id, regions.id)
      .orderBy(desc(ukeLocations.id));

    const totalCount = rows.length > 0 ? rows[0]!.totalCount : await runFallbackCountQuery();

    const data = rows.map((row) => ({
      id: row.id,
      city: row.city,
      address: row.address,
      longitude: row.longitude,
      latitude: row.latitude,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      region: row.region,
      stations: row.stations,
    })) as ResponseData[];

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

const getUkeLocations: Route<ReqQuery, ResponseBody> = {
  url: "/uke/locations",
  method: "GET",
  config: { permissions: ["read:uke_permits"], allowGuestAccess: true, proto: ukeLocationsResponseType },
  schema: schemaRoute,
  handler,
};

export default getUkeLocations;
