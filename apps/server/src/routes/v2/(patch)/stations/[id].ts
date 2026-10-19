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
    "Updates a station, its location, sectors and cells. A failed request changes nothing.\n\n" +
    "Without new coordinates, the fields in `location` edit the location itself, which is shared by all stations at that location. " +
    "With new coordinates, `location.move` decides what moves.\n\n" +
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
    "The change cannot be applied as sent. For example, a band is not in the country's band plan, " +
    "two sectors share an azimuth, or the operator already has another station with this `siteId`.",
  403:
    "Your editor access does not cover the place the station moves to, or a station a cell is moved to. " +
    "Editors can also get this response when the station does not exist.",
  404: "A cell in `cells` does not belong to this station, or a cell is moved to a station that does not exist.",
  409:
    "An active station already has a cell with the same identity on one of the cell's networks: " +
    "`lac` and `cid` for GSM, `rnc` and `cid` for UMTS, `enbid` and `clid` for LTE, `nci` for NR. " +
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
