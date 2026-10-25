import { MEASUREMENT_CONTENT_TYPES, measurementUploadFileGoneSchema } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../errors.js";
import { recordAuditOperation, standaloneAuditContext } from "../../../../../../features/audit/index.js";
import { ENCODING_CONTENT_TYPES } from "../../../../../../features/measurements/uploads/body.js";
import { readUploadFile, uploadFileName } from "../../../../../../features/measurements/uploads/file.js";
import { findVisibleUpload } from "../../../../../../features/measurements/uploads/read.js";
import type { Route } from "../../../../../../interfaces/routes.interface.js";

const paramsSchema = z.object({ id: z.uuid() });
type ReqParams = { Params: z.infer<typeof paramsSchema> };

const schemaRoute = {
  summary: "Download an upload's file",
  description: "An administrator's download of someone else's upload is recorded in the audit log.",
  params: paramsSchema,
  produces: [...MEASUREMENT_CONTENT_TYPES],
  response: { 200: z.file().describe("The `MeasurementBatch` exactly as the app sent it, still compressed") },
};
const errorBodies = {
  410: z.object({
    errors: z.array(z.object({ code: z.literal("GONE"), message: z.string(), details: z.array(measurementUploadFileGoneSchema) })).min(1),
  }),
};
const errorReasons = { 410: "The file is deleted. `fileExpiresAt` says when that happens." };

async function handler(req: FastifyRequest<ReqParams>, res: FastifyReply) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  const { upload, isOwn } = await findVisibleUpload(req, userId, req.params.id);
  const body = await readUploadFile(upload);
  if (!isOwn) await recordAuditOperation(standaloneAuditContext(req), { kind: "observations.upload_download", metadata: { upload_id: upload.id } });

  return res
    .header("Content-Type", ENCODING_CONTENT_TYPES[upload.encoding])
    .header("Content-Disposition", `attachment; filename="${uploadFileName(upload)}"`)
    .send(body);
}

const getMeasurementUploadFile: Route<ReqParams, Buffer> = {
  url: "/measurements/uploads/:id/file",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorBodies, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMeasurementUploadFile;
