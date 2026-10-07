import { OFFSET_LIMIT, searchListSchema, searchQuerySchema } from "@openbts/shared/contract";
import type { Paging, SearchList, SearchQuery } from "@openbts/shared/contract";
import { and } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import { ErrorResponse } from "../../../../errors.js";
import { resolveEditableStations } from "../../../../features/access/filters.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import { findStations } from "../../../../features/search/find.js";
import { queriedStations } from "../../../../features/search/query.js";
import { listStationIds, serializeStations, stationAreaConditions, stationStructureConditions } from "../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { encodeCursor, resolveOffset } from "../../../../lib/cursor.js";

const schemaRoute = {
  summary: "Search stations",
  description:
    "Searches stations using free text, keywords, or both in `q`. " +
    "Free text is matched against site ids and other station identifiers, against cell and base-station identifiers if it is a number, " +
    "and against cities and addresses otherwise. Text shorter than 3 characters only finds exact matches, " +
    "and a pair of decimal coordinates (latitude first) finds stations within 1 km.\n\n" +
    "Keywords are written as `name:value`, for example `rat:lte band:1800`, with commas between alternative values " +
    "and quotes around values that contain spaces. There are keywords for the operator and country (`plmn:`, `country:`), " +
    "the station's status and dates (`status:`, `created_after:`), technology and band (`rat:`, `band:`), " +
    "cell identifiers (`enbid:`, `cid:`) and the place (`city:`, `region:`, `gps:`).\n\n" +
    "Each result has a `match` that tells you which field the free text was found in. It is `null` if `q` only contains keywords.\n\n" +
    "Unless you send `statuses` or a `status:` keyword, only active stations and stations awaiting cells are searched, " +
    "and stations in countries you cannot access are never returned. The other filters work as in `GET /stations`, " +
    "including `keepOtherCountries`, `structureTypes`, `hasPhotos`, `hasSectors`, `isConfirmed` and `editableOnly`. " +
    "`isConfirmed` checks the station itself, while the `is_confirmed:` keyword checks its cells.\n\n" +
    "You can page through roughly 100000 results. After that, `nextCursor` is `null`. " +
    "To jump straight to a page, send `offset` instead of `cursor`.",
  querystring: searchQuerySchema,
  response: {
    200: searchListSchema,
  },
};
const errorReasons = {
  400:
    "A query parameter did not pass validation, the `cursor` is invalid, or `q` contains a misspelled keyword " +
    "or a keyword value that cannot be parsed. For a misspelled keyword, the `message` suggests the one you probably meant.",
  403:
    "You sent `editableOnly` without the `update:stations` permission, or lists are disabled and you sent `listId`. " +
    "Also returned when your API key or token cannot be used for this endpoint, " +
    "two-factor authentication still has to be set up, or the endpoint is disabled.",
  404: "Only returned when you send `listId`. The list does not exist, or it is a private list you cannot access.",
};
type ReqQuery = { Querystring: SearchQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<SearchList>>) {
  const { include, sort, limit, includeTotal, editableOnly } = req.query;

  if (editableOnly && !(await hasStaffPermission(req, { stations: ["update"] }))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  const [hidden, memberIds, editable] = await Promise.all([
    loadHiddenCountryCodes(req),
    listStationIds(req, req.query.listId),
    editableOnly ? resolveEditableStations(req) : undefined,
  ]);
  const { text, stationConditions, locationConditions } = queriedStations(req.query, memberIds, "placement");
  if (memberIds?.length === 0) {
    if (includeTotal) return res.send({ data: [], paging: { limit, nextCursor: null, total: 0 } });
    return res.send({ data: [], paging: { limit, nextCursor: null } });
  }

  const filters = and(
    ...stationConditions,
    ...locationConditions,
    ...stationAreaConditions(req.query, hidden),
    ...stationStructureConditions(req.query),
    editable,
  );
  const offset = resolveOffset(req.query, OFFSET_LIMIT);

  const { found, total } = await findStations({ text, filters, sort, limit: limit + 1, offset, includeTotal: includeTotal === true });
  const page = found.slice(0, limit);
  const stations = await serializeStations(
    page.map((row) => row.station),
    include,
  );
  const nextOffset = offset + limit;
  const paging: Paging = {
    limit,
    nextCursor: found.length > limit && nextOffset <= OFFSET_LIMIT ? encodeCursor({ offset: nextOffset }) : null,
  };
  if (total !== null) paging.total = total;

  return res.send({
    data: stations.map((station, index) => ({ ...station, match: page[index]?.match ?? null })),
    paging,
  });
}

const searchStations: Route<ReqQuery, SearchList> = {
  url: "/search",
  method: "GET",
  config: { permissions: ["read:stations", "read:cells"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default searchStations;
