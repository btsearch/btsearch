import { MEASUREMENT_CONTENT_TYPES } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../errors.js";
import { recordAuditOperation, standaloneAuditContext } from "../../../../../../features/audit/index.js";
import { readUploadFile, uploadFileName } from "../../../../../../features/measurements/uploadFile.js";
import { ENCODING_CONTENT_TYPES, findVisibleUpload } from "../../../../../../features/measurements/uploads.js";
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
const errorReasons = { 404: "Also returned once the file is deleted; `fileExpiresAt` says when that happens." };

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
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMeasurementUploadFile;
