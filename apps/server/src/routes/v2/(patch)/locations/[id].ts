import { locationParamsSchema, locationSchema, locationUpdateSchema } from "@openbts/shared/contract";
import type { Location, LocationUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { defineScope } from "../../../../features/access/scope.js";
import { toStructureChange } from "../../../../features/locations/structure.js";
import { type LocationPatch, locationUpdateScope, updateLocation as saveLocation } from "../../../../features/locations/write.js";
import { findVisibleLocation } from "../../../../features/stations/read.js";
import { toStationLocation } from "../../../../features/stations/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a location",
  description:
    "The change applies to every station at the location, and each of them gets a new `updatedAt`. " +
    "If you change the coordinates without sending `regionId`, the region is determined again from the new coordinates. " +
    "As an editor you need access to the location's region and, when you move it, to the region it moves to.",
  params: locationParamsSchema,
  body: locationUpdateSchema,
  response: {
    200: z.object({
      data: locationSchema,
    }),
  },
};
const errorReasons = {
  400:
    "`structure.ownerId` refers to an owner that does not exist or belongs to a different country than the location, " +
    "or the move puts the location in a country where a station's operator does not belong.",
  403: "Your editor access does not cover the place the location moves to. Editors can also get this response when the location does not exist.",
  409: "Another location already exists at the new coordinates.",
};
type ReqBody = { Body: LocationUpdate };
type ReqParams = { Params: z.infer<typeof locationParamsSchema> };
type RequestData = ReqBody & ReqParams;

function toPatch({ latitude, longitude, regionId, city, address, structure }: LocationUpdate): LocationPatch {
  const patch: LocationPatch = { latitude, longitude, region_id: regionId, ...toStructureChange(structure) };
  if (city !== undefined) patch.city = city || null;
  if (address !== undefined) patch.address = address || null;
  return patch;
}

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Location>>) {
  const { id } = req.params;

  try {
    await saveLocation(req, id, toPatch(req.body));
    const row = await findVisibleLocation(req, id);

    return res.send({ data: toStationLocation(row.location, row.region.countryCode, row.owner) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateLocation: Route<RequestData, Location> = {
  url: "/locations/:id",
  method: "PATCH",
  config: {
    permissions: ["update:locations"],
    scope: defineScope<RequestData>((req) => locationUpdateScope(req.params.id, toPatch(req.body))),
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateLocation;
