import { locations } from "@openbts/drizzle";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { defineScope } from "../../../../features/access/scope.js";
import { STRUCTURE_COLUMNS } from "../../../../features/locations/structure.js";
import { locationUpdateScope, updateLocation as saveLocation } from "../../../../features/locations/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const locationsUpdateSchema = createUpdateSchema(locations)
  .omit(STRUCTURE_COLUMNS)
  .strict()
  .superRefine((data, ctx) => {
    if (hasGenericAddressMarker(data.address))
      ctx.addIssue({ code: "custom", message: "Address must not contain variants of własny", path: ["address"] });
  });
const locationsSelectSchema = createSelectSchema(locations).omit(STRUCTURE_COLUMNS);
const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  body: locationsUpdateSchema,
  response: {
    200: z.object({
      data: locationsSelectSchema,
    }),
  },
};
type ReqBody = { Body: z.infer<typeof locationsUpdateSchema> };
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof locationsSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { id } = req.params;
  if (Number.isNaN(id)) throw new ErrorResponse("INVALID_QUERY");

  try {
    return res.send({ data: await saveLocation(req, id, req.body) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateLocation: Route<RequestData, ResponseData> = {
  url: "/locations/:id",
  method: "PATCH",
  schema: schemaRoute,
  config: {
    permissions: ["update:locations"],
    scope: defineScope<RequestData>((req) => locationUpdateScope(req.params.id, req.body)),
  },
  handler,
};

export default updateLocation;
