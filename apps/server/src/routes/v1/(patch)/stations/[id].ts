import { stations } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import {
  auditContextFromRequest,
  loadPhotoSelectionSnapshots,
  logPhotoSelectionChanges,
  runAuditedOperation,
} from "../../../../services/audit/index.js";
import { deleteLocationWithPhotos } from "../../../../services/locations/deleteWithPhotos.js";
import { migrateStationPhotosToLocation } from "../../../../services/stations/photoMigration.js";
import { stationStatusUpdate } from "../../../../services/stations/status.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

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
    const now = new Date();
    const attachmentUuidsToDelete: string[] = [];
    const updated = await runAuditedOperation(auditContextFromRequest(req), { kind: "station.edit" }, async (tx, audit) => {
      const current = await tx.query.stations.findFirst({ where: { id: station_id } });
      if (!current) throw new ErrorResponse("NOT_FOUND");
      const statusPatch = nextStatus !== undefined && nextStatus !== current.status ? stationStatusUpdate(nextStatus, now) : {};
      const [saved] = await tx
        .update(stations)
        .set({
          ...stationPatch,
          ...statusPatch,
          updatedAt: now,
        })
        .where(eq(stations.id, station_id))
        .returning();
      if (!saved) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({
        entity: "stations",
        op: "update",
        recordId: station_id,
        stationId: station_id,
        old: current,
        new: saved,
      });

      const oldLocationId = current.location_id;
      const newLocationId = saved.location_id;
      if (oldLocationId !== null && oldLocationId !== newLocationId) {
        try {
          const previousSelections = await loadPhotoSelectionSnapshots(tx, [station_id]);
          const remainingStations = await tx.$count(stations, eq(stations.location_id, oldLocationId));
          const oldLocationOrphaned = remainingStations === 0;

          if (newLocationId !== null) await migrateStationPhotosToLocation(audit, station_id, oldLocationId, newLocationId, oldLocationOrphaned);

          if (oldLocationOrphaned) attachmentUuidsToDelete.push(...(await deleteLocationWithPhotos(audit, oldLocationId, station_id)));

          await logPhotoSelectionChanges(audit, previousSelections);
        } catch (error) {
          throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: "Failed to migrate station photos after location change", cause: error });
        }
      }

      return saved;
    });

    await Promise.all(attachmentUuidsToDelete.map((uuid) => fs.unlink(path.join(UPLOAD_DIR, `${uuid}.webp`)).catch(() => {})));

    return res.send({ data: updated });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateStation: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id",
  method: "PATCH",
  config: { permissions: ["update:stations"] },
  schema: schemaRoute,
  handler,
};

export default updateStation;
