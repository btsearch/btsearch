import { stations } from "@openbts/drizzle";
import { stationListQuerySchema, stationListSchema } from "@openbts/shared/contract";
import type { Paging, StationList, StationListQuery, StationSort } from "@openbts/shared/contract";
import { and, count } from "drizzle-orm";
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
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { type SortColumn, type SortField, createKeyset } from "../../../../lib/keyset.js";

const SORT_COLUMNS: Record<SortField<StationSort>, SortColumn | null> = {
  id: null,
  siteId: { column: stations.station_id, kind: "text" },
  createdAt: { column: stations.createdAt, kind: "instant" },
  updatedAt: { column: stations.updatedAt, kind: "instant" },
};

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
  const { include, sort, limit, cursor, offset, includeTotal, editableOnly } = req.query;

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
  const keyset = createKeyset(sort, stations.id, SORT_COLUMNS, cursor);

  const [rows, totals] = await Promise.all([
    db
      .select({ station: stations, key: keyset.key })
      .from(stations)
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1)
      .offset(offset ?? 0),
    includeTotal ? db.select({ total: count() }).from(stations).where(filters) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.station.id, key: last.key }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({
    data: await serializeStations(
      page.map((row) => row.station),
      include,
    ),
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
