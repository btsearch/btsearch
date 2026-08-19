import { cells, extraIdentificators, gsmCells, locations, lteCells, nrCells, operators, regions, stations, umtsCells } from "@openbts/drizzle";
import { type SQL, and, eq, inArray, or, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import type { ReplyPayload } from "../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../interfaces/routes.interface.js";
import { type GroupedFilters, groupFiltersByTable, hasFilters, parseFilterQuery } from "./search.filters.js";

const stationsSelectSchema = createSelectSchema(stations).omit({ status: true, operator_id: true, location_id: true });
const cellsSelectSchema = createSelectSchema(cells);
const gsmCellsSchema = createSelectSchema(gsmCells).omit({ cell_id: true });
const umtsCellsSchema = createSelectSchema(umtsCells).omit({ cell_id: true });
const lteCellsSchema = createSelectSchema(lteCells).omit({ cell_id: true });
const nrCellsSchema = createSelectSchema(nrCells).omit({ cell_id: true });
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();
const locationSelectSchema = createSelectSchema(locations).omit({ point: true, region_id: true });
const regionSelectSchema = createSelectSchema(regions);
const operatorsSelectSchema = createSelectSchema(operators);
const extraIdentificatorsSchema = createSelectSchema(extraIdentificators).omit({ station_id: true });
const cellWithDetailsSchema = cellsSelectSchema.extend({ details: cellDetailsSchema });

type ReqBody = {
  Body: { query?: string };
  Querystring: { limit?: number; sort?: "asc" | "desc"; sortBy?: "station_id" | "updatedAt" | "createdAt" | "relevance" };
};
type CellWithRat = z.infer<typeof cellsSelectSchema> & {
  gsm?: z.infer<typeof gsmCellsSchema>;
  umts?: z.infer<typeof umtsCellsSchema>;
  lte?: z.infer<typeof lteCellsSchema>;
  nr?: z.infer<typeof nrCellsSchema>;
};
type StationWithRatCells = z.infer<typeof stationsSelectSchema> & {
  cells: CellWithRat[];
  location: z.infer<typeof locationSelectSchema> | null;
  operator: z.infer<typeof operatorsSelectSchema> | null;
  extra_identificators?: z.infer<typeof extraIdentificatorsSchema> | null;
};
type StationWithCells = z.infer<typeof stationsSelectSchema> & {
  cells: z.infer<typeof cellWithDetailsSchema>[];
  extra_identificators?: z.infer<typeof extraIdentificatorsSchema>;
  location: z.infer<typeof locationSelectSchema> | null;
  operator: z.infer<typeof operatorsSelectSchema> | null;
};

const schemaRoute = {
  body: z.object({
    query: z.string().min(1, "Query must not be empty"),
  }),
  querystring: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(100),
    sort: z.enum(["asc", "desc"]).optional().default("desc"),
    sortBy: z.enum(["station_id", "updatedAt", "createdAt", "relevance"]).optional().default("relevance"),
  }),
  response: {
    200: z.object({
      data: z.array(
        stationsSelectSchema.extend({
          cells: z.array(cellWithDetailsSchema),
          location: locationSelectSchema
            .extend({
              region: regionSelectSchema,
            })
            .nullable(),
          operator: operatorsSelectSchema.nullable(),
          extra_identificators: extraIdentificatorsSchema.optional(),
        }),
      ),
    }),
  },
};

const stationQueryConfig = {
  with: {
    cells: { with: { gsm: true, umts: true, lte: true, nr: true } },
    location: { with: { region: true }, columns: { point: false, region_id: false } },
    operator: true,
    extra_identificators: { columns: { station_id: false } },
  },
  columns: { status: false, operator_id: false, location_id: false },
} as const;

const ratTables = [
  { table: gsmCells, key: "gsmCells" as const, joinCol: gsmCells.cell_id, searchCols: [gsmCells.cid] as const },
  { table: umtsCells, key: "umtsCells" as const, joinCol: umtsCells.cell_id, searchCols: [umtsCells.cid, umtsCells.cid_long] as const },
  { table: lteCells, key: "lteCells" as const, joinCol: lteCells.cell_id, searchCols: [lteCells.enbid, lteCells.ecid] as const },
  { table: nrCells, key: "nrCells" as const, joinCol: nrCells.cell_id, searchCols: [nrCells.gnbid, nrCells.nci] as const },
] as const;

const withCellDetails = (station: StationWithRatCells): StationWithCells => {
  const transformedCells = station.cells.map(({ gsm, umts, lte, nr, ...rest }) => ({
    ...rest,
    details: gsm ?? umts ?? lte ?? nr ?? null,
  }));
  const result = { ...station, cells: transformedCells } as StationWithCells & { extra_identificators?: unknown };
  if (!result.extra_identificators) delete result.extra_identificators;
  return result;
};

const sortStations = (
  arr: StationWithCells[],
  sortBy: "station_id" | "updatedAt" | "createdAt" | "relevance",
  sort: "asc" | "desc",
): StationWithCells[] => {
  if (sortBy === "relevance") return arr;
  const dir = sort === "asc" ? 1 : -1;
  return [...arr].sort((a, b) => {
    if (sortBy === "station_id") return dir * a.station_id.localeCompare(b.station_id);
    const aTime = new Date(a[sortBy] as Date | string).getTime();
    const bTime = new Date(b[sortBy] as Date | string).getTime();
    return dir * (aTime - bTime);
  });
};

function combineConditions(conditions: SQL[]): SQL | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

const queryRatTableStationIds = async (grouped: GroupedFilters): Promise<number[]> => {
  const queries = ratTables
    .filter(({ key }) => grouped[key].length > 0)
    .map(({ table, key, joinCol }) =>
      db
        .select({ stationId: cells.station_id })
        .from(table)
        .innerJoin(cells, eq(joinCol, cells.id))
        .where(and(...grouped[key])),
    );

  if (queries.length === 0) return [];

  const results = await Promise.all(queries);
  return [...new Set(results.flat().map((r) => r.stationId))];
};

const buildNumericSearchCondition = (columns: readonly unknown[], numericQuery: number, likeQuery: string) =>
  or(...columns.flatMap((col) => [sql`CAST(${col} AS TEXT) = ${numericQuery.toString()}`, sql`CAST(${col} AS TEXT) LIKE ${likeQuery}`]));

const searchNumericInRatTables = async (numericQuery: number, likeQuery: string): Promise<number[]> => {
  const results = await Promise.allSettled(
    ratTables.map(({ table, joinCol, searchCols }) =>
      db
        .select({ stationId: cells.station_id })
        .from(table)
        .innerJoin(cells, eq(joinCol, cells.id))
        .where(buildNumericSearchCondition(searchCols, numericQuery, likeQuery)),
    ),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).map((r) => r.stationId);
};

const resolveQueryStationIds = async (searchQuery: string, limit: number): Promise<number[]> => {
  const isNumeric = /^\d+$/.test(searchQuery);

  const exactPromise =
    searchQuery.length > 3
      ? db
          .select({ id: stations.id })
          .from(stations)
          .where(eq(stations.station_id, searchQuery.toUpperCase()))
          .then((rows) => rows.map((r) => r.id))
      : Promise.resolve([] as number[]);

  const fuzzyPromise = db
    .select({ id: stations.id })
    .from(stations)
    .where(sql`${stations.station_id} % ${searchQuery} OR ${stations.station_id} ILIKE ${"%" + searchQuery + "%"}`)
    .orderBy(sql`similarity(${stations.station_id}, ${searchQuery}) DESC`)
    .limit(limit)
    .then((rows) => rows.map((r) => r.id))
    .catch(() => [] as number[]);

  const thirdPromise = isNumeric
    ? searchNumericInRatTables(Number.parseInt(searchQuery, 10), `%${searchQuery}%`)
    : db
        .select({ id: stations.id })
        .from(stations)
        .innerJoin(locations, eq(stations.location_id, locations.id))
        .where(or(sql`${searchQuery} <% ${locations.city}`, sql`${searchQuery} <% ${locations.address}`))
        .limit(limit)
        .then((rows) => rows.map((r) => r.id));

  const [exactIds, fuzzyIds, thirdIds] = await Promise.all([exactPromise, fuzzyPromise, thirdPromise]);
  return [...new Set([...exactIds, ...fuzzyIds, ...thirdIds])];
};

const fetchStations = async (where?: SQL, limit?: number) => {
  if (!where) {
    return db.query.stations.findMany({
      ...stationQueryConfig,
      ...(limit && { limit }),
    });
  }

  const matchingIds = await db
    .select({ id: stations.id })
    .from(stations)
    .where(where)
    .limit(limit || 100);

  if (matchingIds.length === 0) return [];

  return db.query.stations.findMany({
    where: {
      id: { in: matchingIds.map((r) => r.id) },
    },
    ...stationQueryConfig,
  });
};

const addMissingToMap = async (candidateIds: number[], map: Map<number, StationWithCells>, remaining: number) => {
  const missing = candidateIds.filter((id) => !map.has(id)).slice(0, remaining);
  if (missing.length === 0) return;
  const fetched = await fetchStations(inArray(stations.id, missing), remaining);
  const byId = new Map(fetched.map((s) => [s.id, s]));
  for (const id of missing) {
    const station = byId.get(id);
    if (station) map.set(id, withCellDetails(station));
  }
};

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<StationWithCells[]>>) {
  const { query } = req.body;
  const { limit: requestedLimit, sort = "desc", sortBy = "updatedAt" } = req.query;
  if (!query?.trim()) throw new ErrorResponse("INVALID_QUERY");

  const limit = Math.min(Math.max(requestedLimit ?? 100, 1), 100);
  const { filters, remainingQuery } = parseFilterQuery(query);

  if (hasFilters(filters)) {
    const grouped = groupFiltersByTable(filters);

    const [ratStationIds, cellResult, locationResult, extraResult, queryMatchIds] = await Promise.all([
      queryRatTableStationIds(grouped),
      grouped.cells.length > 0 ? db.selectDistinct({ stationId: cells.station_id }).from(cells).where(combineConditions(grouped.cells)) : null,
      grouped.locations.length > 0 ? db.selectDistinct({ id: locations.id }).from(locations).where(combineConditions(grouped.locations)) : null,
      grouped.extraIdentificators.length > 0
        ? db
            .selectDistinct({ stationId: extraIdentificators.station_id })
            .from(extraIdentificators)
            .where(combineConditions(grouped.extraIdentificators))
        : null,
      remainingQuery ? resolveQueryStationIds(remainingQuery, limit) : null,
    ]);

    const stationConditions: SQL[] = [...grouped.stations];

    const hasRatFilters = ratTables.some(({ key }) => grouped[key].length > 0);
    if (hasRatFilters && ratStationIds.length === 0) return res.send({ data: [] });
    if (ratStationIds.length > 0) stationConditions.push(inArray(stations.id, ratStationIds));

    if (cellResult !== null) {
      if (cellResult.length === 0) return res.send({ data: [] });
      stationConditions.push(
        inArray(
          stations.id,
          cellResult.map((r) => r.stationId),
        ),
      );
    }

    if (locationResult !== null) {
      if (locationResult.length === 0) return res.send({ data: [] });
      stationConditions.push(
        inArray(
          stations.location_id,
          locationResult.map((r) => r.id),
        ),
      );
    }

    if (extraResult !== null) {
      if (extraResult.length === 0) return res.send({ data: [] });
      stationConditions.push(
        inArray(
          stations.id,
          extraResult.map((r) => r.stationId),
        ),
      );
    }

    if (queryMatchIds !== null) {
      if (queryMatchIds.length === 0) return res.send({ data: [] });
      stationConditions.push(inArray(stations.id, queryMatchIds));
    }

    const filteredStations = await fetchStations(combineConditions(stationConditions), limit);
    return res.send({ data: sortStations(filteredStations.map(withCellDetails), sortBy, sort) });
  }

  const searchQuery = remainingQuery || query;
  const stationMap = new Map<number, StationWithCells>();

  const exactMatch = searchQuery.length > 3 ? await fetchStations(eq(stations.station_id, searchQuery.toUpperCase())) : [];
  if (exactMatch.length > 0) return res.send({ data: exactMatch.map(withCellDetails) });

  const fuzzyIds = await db
    .select({ id: stations.id })
    .from(stations)
    .where(sql`${stations.station_id} % ${searchQuery} OR ${stations.station_id} ILIKE ${"%" + searchQuery + "%"}`)
    .orderBy(sql`similarity(${stations.station_id}, ${searchQuery}) DESC`)
    .limit(limit)
    .catch(() => []);
  await addMissingToMap(
    fuzzyIds.map((r) => r.id),
    stationMap,
    limit,
  );

  if (/^\d+$/.test(searchQuery) && stationMap.size < limit) {
    const matchedIds = await searchNumericInRatTables(Number.parseInt(searchQuery, 10), `%${searchQuery}%`);
    await addMissingToMap(matchedIds, stationMap, limit - stationMap.size);
  }

  if (!/^\d+$/.test(searchQuery) && stationMap.size < limit) {
    const cityAndAddressMatches = await db
      .select({ id: stations.id })
      .from(stations)
      .innerJoin(locations, eq(stations.location_id, locations.id))
      .where(or(sql`${searchQuery} <% ${locations.city}`, sql`${searchQuery} <% ${locations.address}`))
      .orderBy(
        sql`(CASE WHEN ${locations.address} ILIKE ${searchQuery} THEN 3 WHEN ${locations.address} ILIKE ${`${searchQuery}%`} THEN 2 WHEN ${locations.address} ILIKE ${`%${searchQuery}%`} THEN 1 ELSE 0 END) DESC`,
        sql`GREATEST(word_similarity(${searchQuery}, ${locations.city}), word_similarity(${searchQuery}, ${locations.address})) DESC`,
      )
      .limit(limit);
    await addMissingToMap(
      cityAndAddressMatches.map((r) => r.id),
      stationMap,
      limit - stationMap.size,
    );
  }

  if (stationMap.size < limit) {
    const extraMatches = await db
      .selectDistinct({ stationId: extraIdentificators.station_id })
      .from(extraIdentificators)
      .where(
        or(
          sql`CAST(${extraIdentificators.networks_id} AS TEXT) ILIKE ${`%${searchQuery}%`}`,
          sql`${extraIdentificators.networks_name} ILIKE ${`%${searchQuery}%`}`,
          sql`${extraIdentificators.mno_name} ILIKE ${`%${searchQuery}%`}`,
        ),
      );
    await addMissingToMap(
      extraMatches.map((r) => r.stationId),
      stationMap,
      limit - stationMap.size,
    );
  }

  const results = Array.from(stationMap.values()).slice(0, limit);
  return res.send({ data: sortBy === "relevance" ? results : sortStations(results, sortBy, sort) });
}

const searchRoute: Route<ReqBody, StationWithCells[]> = {
  url: "/search",
  method: "POST",
  schema: schemaRoute,
  config: { permissions: ["read:stations", "read:cells"], allowGuestAccess: true },
  handler,
};

export default searchRoute;
