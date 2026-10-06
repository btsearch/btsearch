import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../../errors.js";
import { defineScope } from "../../../../../../../features/access/scope.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../../../features/audit/index.js";
import { removeLocationPhoto } from "../../../../../../../features/photos/write.js";
import type { ReplyPayload } from "../../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../../interfaces/routes.interface.js";
import { deletePhotoFiles } from "../../../../../../../utils/photoFiles.js";

const schemaRoute = {
  params: z.object({ location_id: z.coerce.number(), photo_id: z.coerce.number() }),
  response: { 204: z.object({}) },
};

type ReqParams = { Params: { location_id: number; photo_id: number } };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Record<never, never>>>) {
  const { location_id, photo_id } = req.params;
  if (!req.userSession?.user) throw new ErrorResponse("UNAUTHORIZED");

  const attachmentUuid = await runAuditedOperation(auditContextFromRequest(req), { kind: "location.photos" }, (tx, audit) =>
    removeLocationPhoto(tx, audit, location_id, photo_id),
  );

  if (attachmentUuid !== null) await deletePhotoFiles([attachmentUuid]);

  return res.code(204).send({});
}

const deleteLocationPhoto: Route<ReqParams, Record<never, never>> = {
  url: "/locations/:location_id/photos/:photo_id",
  method: "DELETE",
  schema: schemaRoute,
  config: {
    permissions: ["update:stations"],
    scope: defineScope<ReqParams>((req) => ({ locationIds: [req.params.location_id], locationPhotoIds: [req.params.photo_id] })),
  },
  handler,
};

export default deleteLocationPhoto;
