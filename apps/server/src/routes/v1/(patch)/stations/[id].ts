import { locations, stations } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";
import { deleteLocationWithPhotos } from "../../../../utils/location.helpers.js";
import { migrateStationPhotosToLocation } from "../../../../utils/stationPhotos.helpers.js";
import { assertStationStatusTransition, stationStatusUpdate } from "../../../../utils/stationStatus.js";

const stationsUpdateSchema = createUpdateSchema(stations)
  .omit({
    createdAt: true,
    updatedAt: true,
    statusChangedAt: true,
  })
  .strict();
const stationsSelectSchema = createSelectSchema(stations);
const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
  }),
  body: stationsUpdateSchema,
  response: {
    200: z.object({
      data: stationsSelectSchema,
    }),
  },
};
type ReqBody = { Body: z.infer<typeof stationsUpdateSchema> };
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof stationsSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;

  const station = await db.query.stations.findFirst({
    where: {
      id: station_id,
    },
  });
  if (!station) throw new ErrorResponse("NOT_FOUND");
  if (req.body.extra_address !== undefined && req.body.extra_address !== null && req.body.extra_address !== station.extra_address)
    throw new ErrorResponse("FORBIDDEN");

  try {
    const { status: nextStatus, ...stationPatch } = req.body;
    if (nextStatus !== undefined) assertStationStatusTransition(station.status, nextStatus);
    const now = new Date();
    const statusPatch = nextStatus !== undefined && nextStatus !== station.status ? stationStatusUpdate(nextStatus, now) : {};
    const [updated] = await db
      .update(stations)
      .set({
        ...stationPatch,
        ...statusPatch,
        updatedAt: now,
      })
      .where(eq(stations.id, station_id))
      .returning();
    if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");

    await createAuditLog(
      {
        action: "stations.update",
        table_name: "stations",
        record_id: station_id,
        old_values: station,
        new_values: updated,
      },
      req,
    );

    const oldLocationId = station.location_id;
    const newLocationId = updated.location_id;
    if (oldLocationId !== null && oldLocationId !== newLocationId) {
      try {
        await db.transaction(async (tx) => {
          const remainingStations = await tx.$count(stations, eq(stations.location_id, oldLocationId));
          const oldLocationOrphaned = remainingStations === 0;

          if (newLocationId !== null) await migrateStationPhotosToLocation(tx, station_id, oldLocationId, newLocationId, oldLocationOrphaned);

          if (oldLocationOrphaned) {
            const oldLocation = await tx.query.locations.findFirst({
              where: { id: oldLocationId },
              with: { region: { columns: { id: true, name: true, code: true } } },
            });
            if (newLocationId === null) await deleteLocationWithPhotos(tx, oldLocationId);
            else await tx.delete(locations).where(eq(locations.id, oldLocationId));
            await createAuditLog(
              {
                action: "locations.delete",
                table_name: "locations",
                record_id: oldLocationId,
                old_values: oldLocation ?? { id: oldLocationId },
                new_values: null,
                metadata: { station_id: station_id, reason: "stations.update" },
              },
              req,
              tx,
            );
          }
        });
      } catch (error) {
        throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: "Failed to migrate station photos after location change", cause: error });
      }
    }

    return res.send({ data: updated });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateStation: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id",
  method: "PATCH",
  config: { permissions: ["write:stations"] },
  schema: schemaRoute,
  handler,
};

export default updateStation;
