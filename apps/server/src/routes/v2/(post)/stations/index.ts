import { stationCreateSchema, stationQuerySchema, stationSchema } from "@openbts/shared/contract";
import type { Station, StationCreate, StationQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { defineScope } from "../../../../features/access/scope.js";
import { applyStationChange, stationCreateScope } from "../../../../features/stations/edit.js";
import { readStation } from "../../../../features/stations/read.js";
import type { StationEdit } from "../../../../features/submissions/translate.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a station",
  description:
    "Creates a station together with its location, sectors and cells. " +
    "Everything is saved in a single transaction, so a failed request changes nothing. " +
    "If a location already exists at the coordinates, the station is added to it and the `location` fields you send update that location. " +
    "To send `cells` you also need the `create:cells` permission. " +
    "As an editor you need access to the region of the coordinates, or to the operator's whole country when you leave out `location`.",
  querystring: stationQuerySchema,
  body: stationCreateSchema,
  response: {
    201: z.object({
      data: stationSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The request did not pass validation, or the station cannot be created as sent. For example, the operator already has a station " +
    "with this `siteId`, a band is not in the country's band plan, or an operator, region or band does not exist. " +
    "The `message` tells you what is wrong.",
  409:
    "The operator already has a GSM cell with the same `lac` and `cid`, a UMTS cell with the same `rnc` and `cid`, " +
    "or an LTE cell on an active station with the same `enbid` and `clid`.",
};
type RequestData = { Querystring: StationQuery; Body: StationCreate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Station>>) {
  const { station, location, sectors, cells } = req.body;
  const edit: StationEdit = {
    action: "create",
    station,
    location,
    sectors: sectors?.map((sector) => ({ action: "create" as const, ...sector })),
    cells: cells?.map((cell) => ({ action: "create" as const, ...cell })),
  };
  const applied = await applyStationChange(req, edit, "station.create");
  if (applied.stationId === null) throw new ErrorResponse("FAILED_TO_CREATE");

  return res.status(201).send({ data: await readStation(req, applied.stationId, req.query.include) });
}

const createStation: Route<RequestData, Station> = {
  url: "/stations",
  method: "POST",
  config: { permissions: ["create:stations"], scope: defineScope<RequestData>((req) => stationCreateScope(req.body)), errorReasons },
  schema: schemaRoute,
  handler,
};

export default createStation;
