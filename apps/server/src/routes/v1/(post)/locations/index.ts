import { locations } from "@openbts/drizzle";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { defineScope, locationRefs } from "../../../../features/access/scope.js";
import { STRUCTURE_COLUMNS } from "../../../../features/locations/structure.js";
import { findOrCreateLocation } from "../../../../features/locations/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const locationsSelectSchema = createSelectSchema(locations).omit(STRUCTURE_COLUMNS);
const locationsInsertSchema = createInsertSchema(locations)
  .omit(STRUCTURE_COLUMNS)
  .strict()
  .superRefine((data, ctx) => {
    if (hasGenericAddressMarker(data.address))
      ctx.addIssue({ code: "custom", message: "Address must not contain variants of własny", path: ["address"] });
  });
type ReqBody = { Body: z.infer<typeof locationsInsertSchema> };
type ResponseData = z.infer<typeof locationsSelectSchema>;
const schemaRoute = {
  body: locationsInsertSchema,
  response: {
    200: z.object({
      data: locationsSelectSchema,
    }),
  },
};

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  try {
    const { location } = await findOrCreateLocation(req, req.body);
    return res.send({ data: location });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createLocation: Route<ReqBody, ResponseData> = {
  url: "/locations",
  method: "POST",
  config: { permissions: ["create:locations"], scope: defineScope<ReqBody>((req) => locationRefs(req.body)) },
  schema: schemaRoute,
  handler,
};

export default createLocation;
