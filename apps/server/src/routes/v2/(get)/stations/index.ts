import { locations, stations } from "@openbts/drizzle";
import { OFFSET_LIMIT, stationListQuerySchema, stationListSchema } from "@openbts/shared/contract";
import type { Paging, StationList, StationListQuery, StationSort } from "@openbts/shared/contract";
import { type SQL, and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { resolveEditableStations } from "../../../../features/access/filters.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import {
  listStationIds,
  serializeStations,
  stationAreaConditions,
  stationFilterConditions,
  stationStructureConditions,
} from "../../../../features/stations/read.js";
import type { StationRow } from "../../../../features/stations/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { encodeCursor, resolveOffset } from "../../../../lib/cursor.js";
import { type SortColumn, type SortField, createKeyset } from "../../../../lib/keyset.js";

type StationPage = { stations: StationRow[]; nextCursor: string | null };

const SORT_COLUMNS: Record<SortField<Exclude<StationSort, "distance">>, SortColumn | null> = {
  id: null,
  siteId: { column: stations.station_id, kind: "text" },
  createdAt: { column: stations.createdAt, kind: "instant" },
  updatedAt: { column: stations.updatedAt, kind: "instant" },
};

async function listSortedStations(filters: SQL | undefined, query: StationListQuery, sort: Exclude<StationSort, "distance">): Promise<StationPage> {
  const { limit, cursor, offset } = query;
  const keyset = createKeyset(sort, stations.id, SORT_COLUMNS, cursor);
  const rows = await db
    .select({ station: stations, key: keyset.key })
    .from(stations)
    .where(and(filters, keyset.after))
    .orderBy(...keyset.orderBy)
    .limit(limit + 1)
    .offset(offset ?? 0);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor = rows.length > limit && last ? keyset.cursorAfter({ id: last.station.id, key: last.key }) : null;
  return { stations: page.map((row) => row.station), nextCursor };
}

async function listNearestStations(filters: SQL | undefined, query: StationListQuery): Promise<StationPage> {
  const { latitude, longitude, limit } = query;
  const offset = resolveOffset(query, OFFSET_LIMIT);
  const point = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
  const distance = sql<number | null>`${locations.point}::geography <-> ${point}`;
  const lastRow = offset + limit + 1;
  const located = db
    .select({ station: stations, distance: distance.as("distance") })
    .from(stations)
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .where(filters)
    .orderBy(distance, asc(stations.id))
    .limit(lastRow);
  const unlocated = db
    .select({ station: stations, distance: sql<number | null>`NULL::float8`.as("distance") })
    .from(stations)
    .where(and(filters, isNull(stations.location_id)))
    .orderBy(asc(stations.id))
    .limit(lastRow);
  const rows = await located
    .unionAll(unlocated)
    .orderBy(sql`distance NULLS LAST`, asc(stations.id))
    .limit(limit + 1)
    .offset(offset);
  const nextOffset = offset + limit;
  const nextCursor = rows.length > limit && nextOffset <= OFFSET_LIMIT ? encodeCursor({ offset: nextOffset }) : null;
  return { stations: rows.slice(0, limit).map((row) => row.station), nextCursor };
}

const schemaRoute = {
  summary: "List stations",
  querystring: stationListQuerySchema,
  response: {
    200: stationListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
  403: "You sent `editableOnly` without the `update:stations` permission, or lists are disabled and you sent `listId`.",
  404: "The list in `listId` does not exist, or it is a private list you cannot access.",
};
type ReqQuery = { Querystring: StationListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<StationList>>) {
  const { include, sort, limit, includeTotal, editableOnly } = req.query;

  if (editableOnly && !(await hasStaffPermission(req, { stations: ["update"] }))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  const [hidden, memberIds, editable] = await Promise.all([
    loadHiddenCountryCodes(req),
    listStationIds(req, req.query.listId),
    editableOnly ? resolveEditableStations(req) : undefined,
  ]);
  if (memberIds?.length === 0) {
    if (includeTotal) return res.send({ data: [], paging: { limit, nextCursor: null, total: 0 } });
    return res.send({ data: [], paging: { limit, nextCursor: null } });
  }

  const filters = and(
    ...stationFilterConditions(req.query, memberIds, "placement"),
    ...stationAreaConditions(req.query, hidden),
    ...stationStructureConditions(req.query),
    editable,
  );

  const [page, totals] = await Promise.all([
    sort === "distance" ? listNearestStations(filters, req.query) : listSortedStations(filters, req.query, sort),
    includeTotal ? db.select({ total: count() }).from(stations).where(filters) : null,
  ]);
  const paging: Paging = { limit, nextCursor: page.nextCursor };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({
    data: await serializeStations(page.stations, include),
    paging,
  });
}

const getStations: Route<ReqQuery, StationList> = {
  url: "/stations",
  method: "GET",
  config: { permissions: ["read:stations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getStations;
