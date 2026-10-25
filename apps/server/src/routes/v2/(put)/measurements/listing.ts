import { measurementListingSchema, measurementListingUpdateSchema } from "@openbts/shared/contract";
import type { MeasurementListing, MeasurementListingUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { saveListing } from "../../../../features/measurements/contributors/listing.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Choose whether you appear in the leaderboards",
  description:
    "With `isListed: true` you appear in `GET /statistics/leaderboards` by your username from its next daily refresh, " +
    "while your profile is public. " +
    "A private profile takes you off the boards and keeps your choice. The time you agreed is kept until you send `isListed: false`.",
  body: measurementListingUpdateSchema,
  response: {
    200: z.object({
      data: measurementListingSchema,
    }),
  },
};
const errorReasons = {
  403: "Also returned when you never accepted the contributor terms.",
};
type ReqBody = { Body: MeasurementListingUpdate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<MeasurementListing>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await saveListing(userId, req.body.isListed) });
}

const putMeasurementListing: Route<ReqBody, MeasurementListing> = {
  url: "/measurements/listing",
  method: "PUT",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default putMeasurementListing;
