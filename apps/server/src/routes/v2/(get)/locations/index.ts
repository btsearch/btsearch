import { locations, regions, stations, structureOwners } from "@openbts/drizzle";
import { locationListQuerySchema, locationListSchema } from "@openbts/shared/contract";
import type { LocationList, LocationListQuery, LocationSort, Paging } from "@openbts/shared/contract";
import { and, count, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { resolveEditableLocations } from "../../../../features/access/filters.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import { matchesPlace } from "../../../../features/search/freeText.js";
import { matchingStations, queriedStations } from "../../../../features/search/query.js";
import {
  listStationIds,
  locationAreaConditions,
  locationColumns,
  locationStructureConditions,
  serializeLocations,
} from "../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { type SortColumn, type SortField, createKeyset } from "../../../../lib/keyset.js";

const SORT_COLUMNS: Record<SortField<LocationSort>, SortColumn | null> = {
  id: null,
  createdAt: { column: locations.createdAt, kind: "instant" },
  updatedAt: { column: locations.updatedAt, kind: "instant" },
};

const schemaRoute = {
  summary: "List locations",
  description:
    "Returns locations, one page at a time. A location is only returned if at least one of its stations matches the station filters and `q`, " +
    "which by default means an active station or one awaiting cells. " +
    "The station filters work as in `GET /stations`, and `q` accepts the same free text and keywords as `GET /search`.\n\n" +
    "With `include=stations`, each location comes with only the stations that matched. " +
    "Send `includeEmpty=true` to also get locations without a matching station. This needs the `update:locations` permission " +
    "and has no effect when you also send a station filter other than `statuses`, or a station or cell keyword in `q`.\n\n" +
    "`hasStations` looks at whether a location has any station at all, whatever its status and whatever the station filters say. " +
    "`hasStations=false` returns only the locations without stations. It needs the same permission and works without `includeEmpty`. " +
    "`hasStations=true` returns only the locations with at least one station.\n\n" +
    "`editableOnly=true` returns only the locations you can edit, which also needs the `update:locations` permission. " +
    "An editor gets the locations in the countries and regions their grants cover, and an administrator gets every location.\n\n" +
    "`operatorIds` normally filters every country. Send `keepOtherCountries=true` to filter only the countries its operators belong to. " +
    "Stations in every other country then match whatever their operator is, so you can filter one country by operator " +
    "without hiding the other countries on a map. The other filters still apply everywhere.\n\n" +
    "Locations in countries you cannot access are left out.",
  querystring: locationListQuerySchema,
  response: {
    200: locationListSchema,
  },
};
const errorReasons = {
  400:
    "A query parameter did not pass validation, `q` contains a misspelled keyword or a keyword value that cannot be parsed, " +
    "or the `cursor` is invalid. A cursor only works with the `sort` it was returned for.",
  403:
    "You sent `includeEmpty`, `hasStations=false` or `editableOnly` without the `update:locations` permission, " +
    "or lists are disabled and you sent `listId`. " +
    "Also returned when your API key or token cannot be used for this endpoint, two-factor authentication still has to be set up, " +
    "or the endpoint is disabled.",
  404: "Only returned when you send `listId`. The list does not exist, or it is a private list you cannot access.",
};
type ReqQuery = { Querystring: LocationListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<LocationList>>) {
  const { include = [], sort, limit, cursor, offset, includeTotal, includeEmpty, hasStations, editableOnly } = req.query;
  const includesEmpty = includeEmpty === true || hasStations === false;

  if ((includesEmpty || editableOnly) && !(await hasStaffPermission(req, { locations: ["update"] }))) {
    throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
  }

  const [hidden, memberIds, editable] = await Promise.all([
    loadHiddenCountryCodes(req),
    listStationIds(req, req.query.listId),
    editableOnly ? resolveEditableLocations(req) : undefined,
  ]);
  const queried = queriedStations(req.query, memberIds);
  if (memberIds?.length === 0) {
    if (includeTotal) return res.send({ data: [], paging: { limit, nextCursor: null, total: 0 } });
    return res.send({ data: [], paging: { limit, nextCursor: null } });
  }

  const stationFilter = matchingStations(queried);
  const hasAnyStation = sql`EXISTS (SELECT 1 FROM ${stations} WHERE ${stations.location_id} = ${locations.id})`;
  const hasMatchingStation = sql`EXISTS (SELECT 1 FROM ${stations} WHERE ${stations.location_id} = ${locations.id} AND ${stationFilter})`;
  const conditions = [...locationAreaConditions(req.query, hidden), ...locationStructureConditions(req.query), ...queried.locationConditions];
  if (!includesEmpty || queried.narrowsStations) conditions.push(hasMatchingStation);
  else if (queried.text !== "") conditions.push(sql`(${matchesPlace(queried.text)} OR ${hasMatchingStation})`);
  if (hasStations !== undefined) conditions.push(hasStations ? hasAnyStation : sql`NOT ${hasAnyStation}`);
  if (editable) conditions.push(editable);
  const filters = and(...conditions);
  const keyset = createKeyset(sort, locations.id, SORT_COLUMNS, cursor);

  const [rows, totals] = await Promise.all([
    db
      .select({ location: locationColumns, region: regions, owner: structureOwners, key: keyset.key })
      .from(locations)
      .innerJoin(regions, eq(regions.id, locations.region_id))
      .leftJoin(structureOwners, eq(structureOwners.id, locations.structure_owner_id))
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1)
      .offset(offset ?? 0),
    includeTotal ? db.select({ total: count() }).from(locations).innerJoin(regions, eq(regions.id, locations.region_id)).where(filters) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.location.id, key: last.key }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({ data: await serializeLocations(page, include, stationFilter, queried.sectorCondition), paging });
}

const getLocations: Route<ReqQuery, LocationList> = {
  url: "/locations",
  method: "GET",
  config: { permissions: ["read:locations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getLocations;
