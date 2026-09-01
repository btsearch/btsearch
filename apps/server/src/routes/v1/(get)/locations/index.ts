import {
  cells,
  extraIdentificators,
  gsmCells,
  locations,
  lteCells,
  nrCells,
  operators,
  regions,
  stationSectors,
  stations,
  umtsCells,
} from "@openbts/drizzle";
import { LocationsResponseType } from "@openbts/proto/server";
import { and, count, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { getUserListMembership, getVisibleUserList } from "../../../../services/lists/visibility.js";
import { type GroupedFilters, defaultFilterRefs, groupFiltersByTable, parseFilterQuery } from "../../../../services/search/filters.js";
import { buildStatusCondition, parseStationStatusParam } from "../../../../services/stations/status.js";

const locationsSchema = createSelectSchema(locations).omit({ point: true, region_id: true });
const regionsSchema = createSelectSchema(regions);
const stationsSchema = createSelectSchema(stations).omit({ operator_id: true, location_id: true });
const operatorSchema = createSelectSchema(operators);
const sectorSchema = createSelectSchema(stationSectors).omit({ station_id: true });
const stationResponseSchema = stationsSchema.extend({
  operator: operatorSchema.nullable(),
  sectors: z.array(sectorSchema).optional(),
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
    q: z.string().max(500).optional(),
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
      .transform((val) => val === "true" || val === "1"),
    search: z.string().max(100).optional(),
    orphaned: z.coerce.boolean().optional().default(false),
    sort: z.enum(["asc", "desc"]).optional().default("desc"),
    sortBy: z.enum(["id", "updatedAt", "createdAt"]).optional(),
    list: z.string().optional(),
  }),
  response: {
    200: z.object({
      data: z.array(
        locationsSchema.extend({
          region: regionsSchema,
          stations: z.array(stationResponseSchema),
        }),
      ),
      totalCount: z.number(),
    }),
  },
};
type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type StationData = z.infer<typeof stationResponseSchema>;
type ResponseData = z.infer<typeof locationsSchema> & { region: z.infer<typeof regionsSchema>; stations: StationData[] };
type ResponseBody = { data: ResponseData[]; totalCount: number };

const ORPHANED_ALLOWED_ROLES = new Set(["admin", "editor"]);

function appendStationScopedFilterConditions(conditions: ReturnType<typeof sql>[], groupedFilters: GroupedFilters, stationFields: typeof stations) {
  if (groupedFilters.cells.length > 0)
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${cells}
      WHERE ${cells.station_id} = ${stationFields.id}
      AND ${and(...groupedFilters.cells)}
    )`);

  if (groupedFilters.gsmCells.length > 0)
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${cells}
      JOIN ${gsmCells} ON ${gsmCells.cell_id} = ${cells.id}
      WHERE ${cells.station_id} = ${stationFields.id}
      AND ${and(...groupedFilters.gsmCells)}
    )`);

  if (groupedFilters.umtsCells.length > 0)
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${cells}
      JOIN ${umtsCells} ON ${umtsCells.cell_id} = ${cells.id}
      WHERE ${cells.station_id} = ${stationFields.id}
      AND ${and(...groupedFilters.umtsCells)}
    )`);

  if (groupedFilters.lteCells.length > 0)
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${cells}
      JOIN ${lteCells} ON ${lteCells.cell_id} = ${cells.id}
      WHERE ${cells.station_id} = ${stationFields.id}
      AND ${and(...groupedFilters.lteCells)}
    )`);

  if (groupedFilters.nrCells.length > 0)
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${cells}
      JOIN ${nrCells} ON ${nrCells.cell_id} = ${cells.id}
      WHERE ${cells.station_id} = ${stationFields.id}
      AND ${and(...groupedFilters.nrCells)}
    )`);

  if (groupedFilters.extraIdentificators.length > 0)
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${extraIdentificators}
      WHERE ${extraIdentificators.station_id} = ${stationFields.id}
      AND ${and(...groupedFilters.extraIdentificators)}
    )`);
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const {
    bounds,
    limit,
    page,
    rat,
    operators: operatorMncs,
    bands: bandValues,
    regions: regionNames,
    status: selectedStatuses,
    since,
    orphaned,
    azimuths,
    sort,
    sortBy,
    q: query,
    list: listUuid,
  } = req.query;
  const offset = (page - 1) * limit;

  const userRole = req.userSession?.user?.role as string | undefined;
  const showOrphaned = orphaned && userRole !== undefined && ORPHANED_ALLOWED_ROLES.has(userRole);

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
            value: {
              in: bandValues,
            },
          },
        })
      : [],
    expandedOperatorMncs?.length
      ? db.query.operators.findMany({
          columns: { id: true },
          where: {
            mnc: {
              in: expandedOperatorMncs,
            },
          },
        })
      : [],
    regionNames?.length
      ? db.query.regions.findMany({
          columns: { id: true },
          where: {
            code: {
              in: regionNames,
            },
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

  const hasStationFilters = operatorIds.length || bandIds.length || nonIotRats.length || iotRequested || listIdsArray !== undefined;
  const { filters, remainingQuery: remainingSearch } = query ? parseFilterQuery(query) : { filters: {}, remainingQuery: "" };

  const buildStationFilter = (stationFields: typeof stations) => {
    const conditions: ReturnType<typeof sql>[] = [buildStatusCondition(stationFields, selectedStatuses)];
    const stationGroupedFilters = groupFiltersByTable(filters, {
      ...defaultFilterRefs,
      stations: stationFields,
    });

    if (listIdsArray) conditions.push(sql`${stationFields.id} = ANY(${listIdsArray})`);
    if (operatorIds.length) {
      conditions.push(
        sql`${stationFields.operator_id} = ANY(ARRAY[${sql.join(
          operatorIds.map((id) => sql`${id}`),
          sql`,`,
        )}]::int4[])`,
      );
    }

    if (bandIds.length || nonIotRats.length || iotRequested) {
      const cellExistsConditions: ReturnType<typeof sql>[] = [];

      if (bandIds.length || nonIotRats.length) {
        const cellAndConditions: ReturnType<typeof sql>[] = [];
        if (bandIds.length) {
          cellAndConditions.push(
            sql`${cells.band_id} = ANY(ARRAY[${sql.join(
              bandIds.map((id) => sql`${id}`),
              sql`,`,
            )}]::int4[])`,
          );
        }
        if (nonIotRats.length) {
          cellAndConditions.push(
            sql`${cells.rat} IN (${sql.join(
              nonIotRats.map((r) => sql`${r}`),
              sql`,`,
            )})`,
          );
        }
        cellExistsConditions.push(sql`EXISTS (
					SELECT 1 FROM ${cells}
					WHERE ${cells.station_id} = ${stationFields.id}
					AND ${sql.join(cellAndConditions, sql` AND `)}
				)`);
      }

      if (iotRequested) {
        const iotBandCond = bandIds.length
          ? sql`AND ${cells.band_id} = ANY(ARRAY[${sql.join(
              bandIds.map((id) => sql`${id}`),
              sql`,`,
            )}]::int4[])`
          : sql``;
        cellExistsConditions.push(sql`EXISTS (
					SELECT 1 FROM ${cells}
					WHERE ${cells.station_id} = ${stationFields.id}
					${iotBandCond}
					AND (
						EXISTS (SELECT 1 FROM ${lteCells} WHERE ${lteCells.cell_id} = ${cells.id} AND ${lteCells.supports_iot} = true)
						OR EXISTS (SELECT 1 FROM ${nrCells} WHERE ${nrCells.cell_id} = ${cells.id} AND ${nrCells.supports_nr_redcap} = true)
					)
				)`);
      }

      const cellWhere = cellExistsConditions.length > 1 ? sql`(${sql.join(cellExistsConditions, sql` OR `)})` : cellExistsConditions[0];

      conditions.push(cellWhere!);
    }

    if (since) {
      const parts = since.fields.map((field) => sql`${stationFields[field]} >= ${since.cutoff.toISOString()}`);
      const sinceConditions = parts.length > 1 ? sql`(${sql.join(parts, sql` OR `)})` : parts[0];
      conditions.push(sinceConditions!);
    }

    for (const condition of stationGroupedFilters.stations) conditions.push(condition);
    appendStationScopedFilterConditions(conditions, stationGroupedFilters, stationFields);

    return conditions.length > 1 ? sql`(${sql.join(conditions, sql` AND `)})` : conditions[0];
  };

  const buildLocationConditions = (locFields: typeof locations) => {
    const conditions: ReturnType<typeof sql>[] = [];
    const locationGroupedFilters = groupFiltersByTable(filters, {
      ...defaultFilterRefs,
      locations: locFields,
    });
    const listCond = listIdsArray ? sql` AND ${stations.id} = ANY(${listIdsArray})` : sql``;

    if (remainingSearch) {
      const like = `%${remainingSearch}%`;
      conditions.push(sql`(
        ${locFields.city} ILIKE ${like}
        OR ${locFields.address} ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM ${stations}
          WHERE ${stations.location_id} = ${locFields.id}
          AND ${buildStatusCondition(stations, selectedStatuses)}
          AND ${stations.station_id} LIKE ${like}
          ${listCond}
        )
      )`);
    }
    if (envelope) conditions.push(sql`ST_Intersects(${locFields.point}, ${envelope})`);
    if (regionIds.length) {
      conditions.push(
        sql`${locFields.region_id} = ANY(ARRAY[${sql.join(
          regionIds.map((id) => sql`${id}`),
          sql`,`,
        )}]::int4[])`,
      );
    }
    if (since) {
      const parts = since.fields.map((field) => sql`${stations[field]} >= ${since.cutoff.toISOString()}`);
      const sinceConditions = parts.length > 1 ? sql`(${sql.join(parts, sql` OR `)})` : parts[0];
      conditions.push(sql`EXISTS (
        SELECT 1 FROM ${stations}
        WHERE ${stations.location_id} = ${locFields.id}
        AND ${buildStatusCondition(stations, selectedStatuses)}
        AND (${sinceConditions})
        ${listCond}
      )`);
    }
    if (hasStationFilters) {
      const operatorCond = operatorIds.length
        ? sql` AND ${stations.operator_id} = ANY(ARRAY[${sql.join(
            operatorIds.map((id) => sql`${id}`),
            sql`,`,
          )}]::int4[])`
        : sql``;

      if (bandIds.length || nonIotRats.length || iotRequested) {
        const existsClauses: ReturnType<typeof sql>[] = [];

        if (bandIds.length || nonIotRats.length) {
          const cellAndConditions: ReturnType<typeof sql>[] = [];
          if (bandIds.length) {
            cellAndConditions.push(
              sql`${cells.band_id} = ANY(ARRAY[${sql.join(
                bandIds.map((id) => sql`${id}`),
                sql`,`,
              )}]::int4[])`,
            );
          }
          if (nonIotRats.length) {
            cellAndConditions.push(
              sql`${cells.rat} IN (${sql.join(
                nonIotRats.map((r) => sql`${r}`),
                sql`,`,
              )})`,
            );
          }
          existsClauses.push(sql`EXISTS (
						SELECT 1
						FROM ${stations}
						JOIN ${cells} ON ${cells.station_id} = ${stations.id}
						WHERE ${stations.location_id} = ${locFields.id}
						AND ${buildStatusCondition(stations, selectedStatuses)}
						${operatorCond}
						${listCond}
						AND ${sql.join(cellAndConditions, sql` AND `)}
					)`);
        }

        if (iotRequested) {
          const iotBandCond = bandIds.length
            ? sql`AND ${cells.band_id} = ANY(ARRAY[${sql.join(
                bandIds.map((id) => sql`${id}`),
                sql`,`,
              )}]::int4[])`
            : sql``;
          existsClauses.push(sql`EXISTS (
						SELECT 1
						FROM ${stations}
						JOIN ${cells} ON ${cells.station_id} = ${stations.id}
						WHERE ${stations.location_id} = ${locFields.id}
						AND ${buildStatusCondition(stations, selectedStatuses)}
						${operatorCond}
						${listCond}
						${iotBandCond}
						AND (
							EXISTS (SELECT 1 FROM ${lteCells} WHERE ${lteCells.cell_id} = ${cells.id} AND ${lteCells.supports_iot} = true)
							OR EXISTS (SELECT 1 FROM ${nrCells} WHERE ${nrCells.cell_id} = ${cells.id} AND ${nrCells.supports_nr_redcap} = true)
						)
					)`);
        }

        conditions.push(existsClauses.length > 1 ? sql`(${sql.join(existsClauses, sql` OR `)})` : existsClauses[0]!);
      } else {
        conditions.push(sql`
					EXISTS (
						SELECT 1
						FROM ${stations}
						WHERE ${stations.location_id} = ${locFields.id}
						AND ${buildStatusCondition(stations, selectedStatuses)}
						${operatorCond}
						${listCond}
					)
				`);
      }
    } else if (!showOrphaned) {
      conditions.push(sql`
				EXISTS (
					SELECT 1
					FROM ${stations}
					WHERE ${stations.location_id} = ${locFields.id}
					AND ${buildStatusCondition(stations, selectedStatuses)}
				)
			`);
    }

    for (const condition of locationGroupedFilters.locations) conditions.push(condition);

    const hasNonLocationFilters =
      locationGroupedFilters.stations.length > 0 ||
      locationGroupedFilters.cells.length > 0 ||
      locationGroupedFilters.gsmCells.length > 0 ||
      locationGroupedFilters.umtsCells.length > 0 ||
      locationGroupedFilters.lteCells.length > 0 ||
      locationGroupedFilters.nrCells.length > 0 ||
      locationGroupedFilters.extraIdentificators.length > 0;

    if (hasNonLocationFilters) {
      const innerConditions: ReturnType<typeof sql>[] = [
        sql`${stations.location_id} = ${locFields.id}`,
        buildStatusCondition(stations, selectedStatuses),
      ];
      if (listIdsArray) innerConditions.push(sql`${stations.id} = ANY(${listIdsArray})`);
      for (const condition of locationGroupedFilters.stations) innerConditions.push(condition);
      appendStationScopedFilterConditions(innerConditions, locationGroupedFilters, stations);

      conditions.push(sql`EXISTS (SELECT 1 FROM ${stations} WHERE ${and(...innerConditions)})`);
    }

    return conditions;
  };

  try {
    const countConditions = buildLocationConditions(locations);
    const countWhereClause = countConditions.length ? and(...countConditions) : undefined;

    const [countResult, locationRows] = await Promise.all([
      db.select({ count: count() }).from(locations).where(countWhereClause),
      db.query.locations.findMany({
        with: {
          region: true,
          stations: {
            columns: { location_id: false },
            where: { RAW: (fields) => buildStationFilter(fields) ?? sql`true` },
            with: {
              operator: true,
              ...(azimuths ? { sectors: { columns: { station_id: false }, orderBy: { id: "asc" } } } : {}),
            },
          },
        },
        columns: {
          point: false,
          region_id: false,
        },
        where: {
          RAW: (fields) => {
            const conds = buildLocationConditions(fields);
            return and(...conds) ?? sql`true`;
          },
        },
        limit,
        offset,
        orderBy: { [sortBy ?? "id"]: sort ?? "desc" },
      }),
    ]);

    const totalCount = countResult[0]?.count ?? 0;

    return res.send({ data: locationRows, totalCount });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const getLocations: Route<ReqQuery, ResponseBody> = {
  url: "/locations",
  method: "GET",
  config: { permissions: ["read:locations"], allowGuestAccess: true, proto: LocationsResponseType },
  schema: schemaRoute,
  handler,
};

export default getLocations;
