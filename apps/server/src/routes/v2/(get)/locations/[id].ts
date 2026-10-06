import { locationParamsSchema, locationQuerySchema, locationSchema } from "@openbts/shared/contract";
import type { Location, LocationQuery } from "@openbts/shared/contract";
import { and, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { matchingStations, queriedStations } from "../../../../features/search/query.js";
import { findVisibleLocation, listStationIds, serializeLocation } from "../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a location",
  description:
    "Returns a single location. The station filters and `q` never hide the location itself. " +
    "They only select which stations are included with `include=stations`, by default the active ones and the ones awaiting cells. " +
    "With `keepOtherCountries=true`, `operatorIds` is only applied if the location is in a country its operators belong to.",
  params: locationParamsSchema,
  querystring: locationQuerySchema,
  response: {
    200: z.object({
      data: locationSchema,
    }),
  },
};
const errorReasons = {
  400: "A parameter did not pass validation, or `q` contains a misspelled keyword or a keyword value that cannot be parsed.",
  403:
    "Lists are disabled and you sent `listId`. Also returned when your API key or token cannot be used for this endpoint, " +
    "two-factor authentication still has to be set up, or the endpoint is disabled.",
  404:
    "The location does not exist, or it is in a country you cannot access. " +
    "Also returned when the list in `listId` does not exist or is a private list you cannot access.",
};
type RequestData = { Params: z.infer<typeof locationParamsSchema>; Querystring: LocationQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Location>>) {
  const row = await findVisibleLocation(req, req.params.id);

  const memberIds = await listStationIds(req, req.query.listId);
  const queried = queriedStations(req.query, memberIds);
  const stationFilter = memberIds?.length === 0 ? sql`false` : and(matchingStations(queried), ...queried.locationConditions);

  return res.send({ data: await serializeLocation(row, req.query.include ?? [], stationFilter, queried.sectorCondition) });
}

const getLocation: Route<RequestData, Location> = {
  url: "/locations/:id",
  method: "GET",
  config: { permissions: ["read:locations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getLocation;
