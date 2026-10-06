import { attachments, locationPhotos } from "@openbts/drizzle";
import { photoOwnerParamsSchema, photoSchema, stationPhotosReplaceSchema } from "@openbts/shared/contract";
import type { Photo, StationPhotosReplace } from "@openbts/shared/contract";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { defineScope } from "../../../../../features/access/scope.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../features/audit/index.js";
import { loadStationPhotoRows, serializePhotos } from "../../../../../features/photos/read.js";
import { replaceStationPhotoSelections } from "../../../../../features/photos/write.js";
import { findVisibleStation } from "../../../../../features/stations/read.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Replace a station's photos",
  description:
    "Sets which photos of its location a station shows, and which one is the main photo. " +
    "The list you send replaces the current selection. " +
    "A photo you leave out is no longer shown by this station, but it stays with the location. " +
    "Without `mainPhotoId` the station has no main photo. Returns the photos the station shows after the change.",
  params: photoOwnerParamsSchema,
  body: stationPhotosReplaceSchema,
  response: {
    200: z.object({
      data: z.array(photoSchema),
    }),
  },
};
const errorReasons = {
  400: "The request did not pass validation, or one of the photos in `photoIds` does not belong to the station's location.",
  403:
    "A permission is missing, or your editor access does not cover the station's country or region. " +
    "Editors also get this response when the station does not exist.",
  404: "The station does not exist.",
};
type RequestData = { Params: z.infer<typeof photoOwnerParamsSchema>; Body: StationPhotosReplace };

async function locationPhotoIdsByFile(locationId: number | null, fileIds: readonly string[]): Promise<Map<string, number>> {
  if (locationId === null || fileIds.length === 0) return new Map();

  const rows = await db
    .select({ id: locationPhotos.id, fileId: attachments.uuid })
    .from(locationPhotos)
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .where(and(eq(locationPhotos.location_id, locationId), inArray(attachments.uuid, [...fileIds])));
  return new Map(rows.map((row) => [row.fileId, row.id]));
}

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Photo[]>>) {
  const { id } = req.params;
  const { photoIds, mainPhotoId } = req.body;

  const station = await findVisibleStation(req, id);
  const idsByFile = await locationPhotoIdsByFile(station.location_id, photoIds);
  if (idsByFile.size !== photoIds.length) throw new ErrorResponse("BAD_REQUEST", { message: "Some photos do not belong to this station's location" });

  const selected = photoIds.flatMap((photoId) => idsByFile.get(photoId) ?? []);
  const mainId = typeof mainPhotoId === "string" ? (idsByFile.get(mainPhotoId) ?? null) : null;

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "station.photos" }, (tx, audit) =>
      replaceStationPhotoSelections(tx, audit, id, selected, mainId),
    );
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }

  return res.send({ data: await serializePhotos(await loadStationPhotoRows(id), await loadUserRefViewer(req)) });
}

const replaceStationPhotos: Route<RequestData, Photo[]> = {
  url: "/stations/:id/photos",
  method: "PUT",
  config: {
    permissions: ["update:stations"],
    scope: defineScope<RequestData>((req) => ({ stationIds: [req.params.id] })),
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default replaceStationPhotos;
