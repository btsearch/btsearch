import { stations } from "@openbts/drizzle";
import { locationParamsSchema, noContentSchema } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { defineScope } from "../../../../features/access/scope.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { deleteLocationWithPhotos } from "../../../../features/locations/deleteWithPhotos.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";
import { deletePhotoFiles } from "../../../../utils/photoFiles.js";

const schemaRoute = {
  summary: "Delete a location",
  description:
    "Deletes a location together with its photos. You can only delete a location that has no stations left, " + "and inactive stations count too.",
  params: locationParamsSchema,
  response: { 204: noContentSchema },
};
type ReqParams = { Params: z.infer<typeof locationParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const location = await db.query.locations.findFirst({ where: { id }, columns: { id: true } });
  if (!location) throw new ErrorResponse("NOT_FOUND");

  const stationCount = await db.$count(stations, eq(stations.location_id, id));
  if (stationCount > 0) throw new ErrorResponse("CONFLICT", { message: "Cannot delete a location that still has stations" });

  let attachmentUuids: string[];
  try {
    attachmentUuids = await runAuditedOperation(standaloneAuditContext(req), { kind: "location.delete" }, (_tx, audit) =>
      deleteLocationWithPhotos(audit, id),
    );
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
  await deletePhotoFiles(attachmentUuids);

  return res.status(204).send();
}

const deleteLocation: Route<ReqParams, void> = {
  url: "/locations/:id",
  method: "DELETE",
  config: {
    permissions: ["delete:locations"],
    scope: defineScope<ReqParams>((req) => ({ locationIds: [req.params.id] })),
    errorReasons: { 404: "The location does not exist.", 409: "The location still has stations. Inactive stations count too." },
  },
  schema: schemaRoute,
  handler,
};

export default deleteLocation;
