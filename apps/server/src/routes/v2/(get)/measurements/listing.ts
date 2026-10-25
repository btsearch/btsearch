import { measurementListingSchema } from "@openbts/shared/contract";
import type { MeasurementListing } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { findListing } from "../../../../features/measurements/contributors/listing.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get whether you appear in the leaderboards",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: measurementListingSchema,
    }),
  },
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<MeasurementListing>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await findListing(userId) });
}

const getMeasurementListing: Route<RouteGenericInterface, MeasurementListing> = {
  url: "/measurements/listing",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementListing;
