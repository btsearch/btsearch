import { bands, cells, extraIdentificators, locations, lteCells, nrCells, operators, regions, stations } from "@openbts/drizzle";
import { StationsResponseType } from "@openbts/proto/server";
import { and, count, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { getUserListMembership, getVisibleUserList } from "../../../../services/lists/visibility.js";
import { buildStatusCondition, parseStationStatusParam } from "../../../../services/stations/status.js";

const stationsSchema = createSelectSchema(stations).omit({ operator_id: true, location_id: true });
const cellsSchema = createSelectSchema(cells).omit({ band_id: true, station_id: true });
const bandsSchema = createSelectSchema(bands);
const regionSchema = createSelectSchema(regions);
const locationSchema = createSelectSchema(locations).omit({ point: true, region_id: true });
const operatorSchema = createSelectSchema(operators);
const extraIdentificatorsSchema = createSelectSchema(extraIdentificators).omit({ station_id: true });
const cellResponseSchema = cellsSchema.extend({ band: bandsSchema });
const stationResponseSchema = stationsSchema.extend({
  cells: z.array(cellResponseSchema),
  location: locationSchema.extend({ region: regionSchema }),
  operator: operatorSchema,
  extra_identificators: extraIdentificatorsSchema.optional(),
});
type Station = z.infer<typeof stationResponseSchema>;
type CellWithBand = z.infer<typeof cellsSchema> & { band: z.infer<typeof bandsSchema> | null };
type StationRaw = z.infer<typeof stationsSchema> & { cells: CellWithBand[]; extra_identificators?: z.infer<typeof extraIdentificatorsSchema> | null };
const schemaRoute = {
  querystring: z.object({
    bounds: z
      .string()
      .regex(/^-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+$/)
      .optional()
      .transform((val): number[] | undefined => (val ? val.split(",").map(Number) : undefined)),
    limit: z.coerce.number().min(1).max(1000).optional().default(150),
    page: z.coerce.number().min(1).default(1),
    rat: z
      .string()
      .regex(/^(?:cdma|umts|gsm|lte|nr|iot)(?:,(?:cdma|umts|gsm|lte|nr|iot))*$/i)
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
    status: z
      .string()
      .regex(/^(?:published|pending|inactive)(?:,(?:published|pending|inactive))*$/)
      .optional()
      .transform(parseStationStatusParam),
    regions: z
      .string()
      .regex(/^[A-Z]{3}(,[A-Z]{3})*$/)
      .optional()
      .transform((val): string[] | undefined => (val ? val.split(",").filter(Boolean) : undefined)),
    sort: z.enum(["asc", "desc"]).optional().default("desc"),
    sortBy: z.enum(["station_id", "updatedAt", "createdAt"]).optional(),
    list: z.string().optional(),
  }),
  response: {
    200: z.object({
      data: z.array(stationResponseSchema),
      totalCount: z.number(),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResponseBody = { data: Station[]; totalCount: number };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const {
    limit,
    page,
    bounds,
    rat,
    operators: operatorMncs,
    bands: bandValues,
    status: selectedStatuses,
    regions,
    sort,
    sortBy,
    list: listUuid,
  } = req.query;
  const offset = limit ? (page - 1) * limit : undefined;

  let listStationIds: number[] | undefined;
  if (listUuid) {
    const list = await getVisibleUserList(listUuid, req.userSession?.user.id);
    listStationIds = getUserListMembership(list).internal;
    if (!listStationIds.length) return res.send({ data: [], totalCount: 0 });
  }
  const listIdsArray = listStationIds?.length
    ? sql`ARRAY[${sql.join(
        listStationIds.map((id) => sql`${id}`),
        sql`,`,
      )}]::int4[]`
    : undefined;

  const expandedOperatorMncs = operatorMncs?.includes(26034) ? [...new Set([...operatorMncs, 26002, 26003])] : operatorMncs;

  let envelope: ReturnType<typeof sql> | undefined;
  if (bounds) {
    const [la1, lo1, la2, lo2] = bounds as [number, number, number, number];
    const [west, south] = [Math.min(lo1, lo2), Math.min(la1, la2)];
    const [east, north] = [Math.max(lo1, lo2), Math.max(la1, la2)];
    envelope = sql`ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`;
  }

  const [bandRows, operatorRows, regionsRows] = await Promise.all([
    bandValues?.length
      ? db.query.bands.findMany({
          columns: { id: true },
          where: {
            value: { in: bandValues },
          },
        })
      : [],
    expandedOperatorMncs?.length
      ? db.query.operators.findMany({
          columns: { id: true },
          where: {
            mnc: { in: expandedOperatorMncs },
          },
        })
      : [],
    regions?.length
      ? db.query.regions.findMany({
          columns: { id: true },
          where: {
            code: { in: regions },
          },
        })
      : [],
  ]);

  const bandIds = bandRows.map((b) => b.id);
  const operatorIds = operatorRows.map((r) => r.id);
  const regionIds = regionsRows.map((r) => r.id);

  if (bandValues?.length && !bandIds.length) return res.send({ data: [], totalCount: 0 });

  const requestedRats = rat ?? [];
  type NonIotRat = "GSM" | "UMTS" | "LTE" | "NR";
  const ratMap: Record<string, NonIotRat> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" } as const;
  const nonIotRats: NonIotRat[] = requestedRats.map((r) => ratMap[r]).filter((r): r is NonIotRat => r !== undefined);
  const iotRequested = requestedRats.includes("iot");

  const buildStationConditions = (stationFields: typeof stations): ReturnType<typeof sql>[] => {
    const conditions: ReturnType<typeof sql>[] = [buildStatusCondition(stationFields, selectedStatuses)];

    if (listIdsArray) conditions.push(sql`${stationFields.id} = ANY(${listIdsArray})`);
    if (operatorIds.length) {
      conditions.push(
        sql`${stationFields.operator_id} = ANY(ARRAY[${sql.join(
          operatorIds.map((id) => sql`${id}`),
          sql`,`,
        )}]::int4[])`,
      );
    }
    if (envelope)
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${locations} WHERE ${locations.id} = ${stationFields.location_id} AND ST_Intersects(${locations.point}, ${envelope}))`,
      );
    if (regionIds.length) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${locations} WHERE ${locations.id} = ${stationFields.location_id} AND ${locations.region_id} = ANY(ARRAY[${sql.join(
          regionIds.map((id) => sql`${id}`),
          sql`,`,
        )}]::int4[]))`,
      );
    }
    if (bandIds.length || nonIotRats.length || iotRequested) {
      const bandCond = bandIds.length
        ? sql` AND ${cells.band_id} = ANY(ARRAY[${sql.join(
            bandIds.map((id) => sql`${id}`),
            sql`,`,
          )}]::int4[])`
        : sql``;
      const ratCond = nonIotRats.length
        ? sql` AND ${cells.rat} IN (${sql.join(
            nonIotRats.map((r) => sql`${r}`),
            sql`,`,
          )})`
        : sql``;
      const iotCond = iotRequested
        ? sql`AND (
						EXISTS (SELECT 1 FROM ${lteCells} WHERE ${lteCells.cell_id} = ${cells.id} AND ${lteCells.supports_iot} = true)
						OR EXISTS (SELECT 1 FROM ${nrCells} WHERE ${nrCells.cell_id} = ${cells.id} AND ${nrCells.supports_nr_redcap} = true)
					)`
        : sql``;

      conditions.push(sql`
				EXISTS (
					SELECT 1
					FROM ${cells}
					WHERE ${cells.station_id} = ${stationFields.id}
					${bandCond}
					${ratCond}
					${iotCond}
				)
			`);
    }

    return conditions;
  };

  try {
    const countWhereClause = buildStationConditions(stations);
    const countWhere = countWhereClause.length ? and(...countWhereClause) : undefined;

    const [countResult, btsStations] = await Promise.all([
      db.select({ count: count() }).from(stations).where(countWhere),
      db.query.stations.findMany({
        columns: {
          operator_id: false,
          location_id: false,
        },
        with: {
          cells: {
            columns: { band_id: false, station_id: false },
            with: { band: true },
          },
          location: { columns: { point: false, region_id: false }, with: { region: true } },
          operator: true,
          extra_identificators: { columns: { station_id: false } },
        },
        where: {
          RAW: (fields) => {
            const conds = buildStationConditions(fields);
            return and(...conds) ?? sql`true`;
          },
        },
        limit,
        offset,
        orderBy: { [sortBy ?? "id"]: sort ?? "desc" },
      }),
    ]);

    const totalCount = countResult[0]?.count ?? 0;

    const mappedStations: Station[] = btsStations.map((station: StationRaw) => {
      const cellsWithoutDetails = station.cells.map((cell) => {
        const { band, ...rest } = cell;
        return { ...rest, band };
      });

      const stationWithNetworks = { ...station, cells: cellsWithoutDetails } as Station & {
        extra_identificators?: z.infer<typeof extraIdentificatorsSchema> | null;
      };
      if (!stationWithNetworks.extra_identificators) delete (stationWithNetworks as { extra_identificators?: unknown }).extra_identificators;
      return stationWithNetworks as Station;
    });

    return res.send({ data: mappedStations, totalCount });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const getStations: Route<ReqQuery, ResponseBody> = {
  url: "/stations",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read:stations"], allowGuestAccess: true, proto: StationsResponseType },
  handler,
};

export default getStations;
