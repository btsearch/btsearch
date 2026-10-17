import { rejectedPhotoRemovalSchema } from "@openbts/shared/contract";
import type { RejectedPhotoRemoval } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { standaloneAuditContext } from "../../../../features/audit/index.js";
import { removeRejectedSubmissionPhotosInBatches } from "../../../../features/submissions/cleanup.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete photos of rejected submissions",
  description:
    "The server deletes them on its own 30 days after a rejection. " +
    "Use this endpoint to delete them right away, whatever their age, starting with the oldest rejections. " +
    "One request handles up to 500 submissions. " +
    "It keeps working while submissions are disabled.",
  response: {
    200: z.object({
      data: rejectedPhotoRemovalSchema,
    }),
  },
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<RejectedPhotoRemoval>>) {
  if (!(await hasStaffPermission(req, { submissions: ["cleanup"] }))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  let removed: RejectedPhotoRemoval;
  try {
    removed = await removeRejectedSubmissionPhotosInBatches(standaloneAuditContext(req));
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.send({ data: removed });
}

const removeRejectedPhotos: Route<RouteGenericInterface, RejectedPhotoRemoval> = {
  url: "/submissions/rejected-photos",
  method: "DELETE",
  config: { permissions: ["cleanup:submissions"] },
  schema: schemaRoute,
  handler,
};

export default removeRejectedPhotos;
