import { locations } from "@openbts/drizzle";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";

const locationsSelectSchema = createSelectSchema(locations);
const locationsInsertSchema = createInsertSchema(locations)
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
    const existing = await db.query.locations.findFirst({
      where: { AND: [{ longitude: req.body.longitude }, { latitude: req.body.latitude }] },
    });
    if (existing) return res.send({ data: existing });

    const [location] = await db.insert(locations).values(req.body).returning();

    if (!location) throw new ErrorResponse("FAILED_TO_CREATE");

    const locationWithRegion = await db.query.locations.findFirst({
      where: { id: location.id },
      with: { region: { columns: { id: true, name: true, code: true } } },
    });

    await createAuditLog(
      { action: "locations.create", table_name: "locations", record_id: location.id, new_values: locationWithRegion ?? location },
      req,
    );
    return res.send({ data: location });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createLocation: Route<ReqBody, ResponseData> = {
  url: "/locations",
  method: "POST",
  config: { permissions: ["write:locations"] },
  schema: schemaRoute,
  handler,
};

export default createLocation;
