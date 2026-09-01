import { locations, stations } from "@openbts/drizzle";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";

const locationsUpdateSchema = createUpdateSchema(locations)
  .strict()
  .superRefine((data, ctx) => {
    if (hasGenericAddressMarker(data.address))
      ctx.addIssue({ code: "custom", message: "Address must not contain variants of własny", path: ["address"] });
  });
const locationsSelectSchema = createSelectSchema(locations);
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

  const location = await db.query.locations.findFirst({
    where: {
      id,
    },
    with: { region: { columns: { id: true, name: true, code: true } } },
  });
  if (!location) throw new ErrorResponse("NOT_FOUND");

  try {
    const [updated] = await db
      .update(locations)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(locations.id, id))
      .returning();
    if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");

    const updatedWithRegion = await db.query.locations.findFirst({
      where: { id },
      with: { region: { columns: { id: true, name: true, code: true } } },
    });

    await createAuditLog(
      { action: "locations.update", table_name: "locations", record_id: id, old_values: location, new_values: updatedWithRegion ?? updated },
      req,
    );

    const linkedStations = await db.query.stations.findMany({
      where: { location_id: id },
    });
    if (linkedStations.length > 0) {
      const now = new Date();
      await db.update(stations).set({ updatedAt: now }).where(eq(stations.location_id, id));
      await Promise.all(
        linkedStations.map((station) =>
          createAuditLog(
            {
              action: "stations.update",
              table_name: "stations",
              record_id: station.id,
              old_values: station,
              new_values: { ...station, updatedAt: now },
              metadata: { reason: "locations.update", location_id: id },
            },
            req,
          ),
        ),
      );
    }

    return res.send({
      data: updated,
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateLocation: Route<RequestData, ResponseData> = {
  url: "/locations/:id",
  method: "PATCH",
  schema: schemaRoute,
  config: { permissions: ["write:locations"] },
  handler,
};

export default updateLocation;
