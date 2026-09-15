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
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";

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
  });
  if (!location) throw new ErrorResponse("NOT_FOUND");

  const linkedStations = await db.query.stations.findMany({
    where: { location_id: id },
    columns: { id: true },
  });
  const stationIds = linkedStations.map((station) => station.id);

  try {
    const updated = await runAuditedOperation(
      auditContextFromRequest(req),
      { kind: "location.edit", metadata: { station_ids: stationIds } },
      async (tx, audit) => {
        const oldLocation = await tx.query.locations.findFirst({ where: { id } });
        if (!oldLocation) throw new ErrorResponse("NOT_FOUND");

        const [nextLocation] = await tx
          .update(locations)
          .set({ ...req.body, updatedAt: new Date() })
          .where(eq(locations.id, id))
          .returning();
        if (!nextLocation) throw new ErrorResponse("FAILED_TO_UPDATE");

        await audit.log({ entity: "locations", op: "update", recordId: id, old: oldLocation, new: nextLocation });
        if (stationIds.length > 0) await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.location_id, id));
        return nextLocation;
      },
    );

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
  config: { permissions: ["update:locations"] },
  handler,
};

export default updateLocation;
