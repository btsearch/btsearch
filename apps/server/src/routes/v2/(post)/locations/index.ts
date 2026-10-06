import { locationCreateSchema, locationSchema } from "@openbts/shared/contract";
import type { Location, LocationCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { defineScope, locationRefs } from "../../../../features/access/scope.js";
import { toStructureChange } from "../../../../features/locations/structure.js";
import { type NewLocation, findOrCreateLocation } from "../../../../features/locations/write.js";
import { findVisibleLocation } from "../../../../features/stations/read.js";
import { toStationLocation } from "../../../../features/stations/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const createdSchema = z.object({ data: locationSchema });
const schemaRoute = {
  summary: "Create a location",
  description:
    "Creates a location at the given coordinates. If a location already exists at exactly these coordinates, it is returned unchanged " +
    "with 200 instead of creating a new one, and the other fields you sent are ignored. " +
    "As an editor you need access to the region of the coordinates.",
  body: locationCreateSchema,
  response: {
    200: createdSchema.describe("A location already exists at these coordinates. It is returned unchanged."),
    201: createdSchema,
  },
};
const errorReasons = {
  400:
    "The request did not pass validation, no region could be determined from the coordinates and you did not send `regionId`, " +
    "or `structure.ownerId` refers to an owner that does not exist or belongs to a different country than the location.",
  409: "Another request created a location at the same coordinates while yours was being processed.",
};
type ReqBody = { Body: LocationCreate };

function toNewLocation({ latitude, longitude, regionId, city, address, structure }: LocationCreate): NewLocation {
  return { latitude, longitude, region_id: regionId, city: city || null, address: address || null, ...toStructureChange(structure) };
}

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Location>>) {
  try {
    const { location, isNew } = await findOrCreateLocation(req, toNewLocation(req.body));
    const row = await findVisibleLocation(req, location.id);

    return res.status(isNew ? 201 : 200).send({ data: toStationLocation(row.location, row.region.countryCode, row.owner) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createLocation: Route<ReqBody, Location> = {
  url: "/locations",
  method: "POST",
  config: {
    permissions: ["create:locations"],
    scope: defineScope<ReqBody>((req) => locationRefs({ region_id: req.body.regionId, longitude: req.body.longitude, latitude: req.body.latitude })),
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default createLocation;
