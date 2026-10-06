import { stationParamsSchema, stationQuerySchema, stationSchema, stationUpdateSchema } from "@openbts/shared/contract";
import type { Station, StationQuery, StationUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { defineScope } from "../../../../features/access/scope.js";
import { applyStationChange, stationUpdateScope } from "../../../../features/stations/edit.js";
import { findVisibleStation, readStation } from "../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a station",
  description:
    "Updates a station, its location, sectors and cells in a single transaction. " +
    "Only what you send is changed, and a failed request changes nothing.\n\n" +
    "Without new coordinates, the fields in `location` edit the location itself, which is shared by all stations at that location. " +
    "With new coordinates, `location.move` decides what moves. `station`, the default, moves only this station " +
    "and creates a location at the new coordinates if there is none. `location` moves the whole location with all its stations.\n\n" +
    "A location that is left without stations is deleted. Its photos move along with the station, " +
    "but they are deleted when you detach the station with `location: null`.\n\n" +
    "As an editor you need access to the whole country to detach a station. " +
    "Changing `cells` also needs the matching permission, which is `create:cells`, `update:cells` or `delete:cells`. " +
    "Users who watch the station are notified when its cells change.",
  params: stationParamsSchema,
  querystring: stationQuerySchema,
  body: stationUpdateSchema,
  response: {
    200: z.object({
      data: stationSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The request did not pass validation, or the change cannot be applied as sent. For example, a band is not in the country's band plan, " +
    "two sectors share an azimuth, or the operator already has another station with this `siteId`. " +
    "The `message` tells you what is wrong.",
  403:
    "A permission is missing, or your editor access does not cover the station, the place it moves to or a station a cell is moved to. " +
    "Editors can also get this response when the station does not exist.",
  404:
    "The station does not exist. Also returned when a cell in `cells` does not belong to this station, " +
    "or a cell is moved to a station that does not exist.",
  409:
    "The operator already has a GSM cell with the same `lac` and `cid`, a UMTS cell with the same `rnc` and `cid`, " +
    "or an LTE cell on an active station with the same `enbid` and `clid`. " +
    "Also returned when the station already has an LTE or NR cell with the same `pci` on the same band.",
};
type RequestData = { Params: z.infer<typeof stationParamsSchema>; Querystring: StationQuery; Body: StationUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Station>>) {
  const { id } = req.params;
  await findVisibleStation(req, id);
  await applyStationChange(req, { action: "update", stationId: id, ...req.body }, "station.edit");

  return res.send({ data: await readStation(req, id, req.query.include) });
}

const updateStation: Route<RequestData, Station> = {
  url: "/stations/:id",
  method: "PATCH",
  config: { permissions: ["update:stations"], scope: defineScope<RequestData>((req) => stationUpdateScope(req.params.id, req.body)), errorReasons },
  schema: schemaRoute,
  handler,
};

export default updateStation;
