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
  description:
    "Returns stations, one page at a time. " +
    "By default you get active stations and stations awaiting cells. Use `statuses` to get inactive stations as well.\n\n" +
    "If you send both `bandIds` and `rats`, a station must have a cell that matches both. " +
    "`supportsIot` checks for an LTE cell that supports IoT or an NR cell that supports RedCap. " +
    "If an operator in `operatorIds` is a shared network, the stations of its members are returned too.\n\n" +
    "`operatorIds` normally filters every country. Send `keepOtherCountries=true` to filter only the countries its operators belong to. " +
    "Stations in every other country then match whatever their operator is, so you can filter one country by operator " +
    "and still get every station of the others.\n\n" +
    "`hasPhotos`, `hasSectors` and `isConfirmed` each take `true` or `false`, so you can also ask for the stations that lack something, " +
    "for example `hasPhotos=false` for stations without photos. " +
    "`structureTypes` filters by the structure at the station's location, and `unknown` in that list matches locations without a known type.\n\n" +
    "`editableOnly=true` returns only the stations you can edit, which needs the `update:stations` permission. " +
    "An editor gets the stations in the countries and regions their grants cover, and an administrator gets every station.\n\n" +
    "`listId` limits the result to the stations on a list. You can use a public list, one of your own, " +
    "or any list if you have the `read_all:user_lists` permission.\n\n" +
    "Stations in countries you cannot access are left out.",
  querystring: stationListQuerySchema,
  response: {
    200: stationListSchema,
  },
};
const errorReasons = {
  400: "A query parameter did not pass validation, or the `cursor` is invalid. A cursor only works with the `sort` it was returned for.",
  403:
    "You sent `editableOnly` without the `update:stations` permission, or lists are disabled and you sent `listId`. " +
    "Also returned when your API key or token cannot be used for this endpoint, " +
    "two-factor authentication still has to be set up, or the endpoint is disabled.",
  404: "Only returned when you send `listId`. The list does not exist, or it is a private list you cannot access.",
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
