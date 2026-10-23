import { measurementUploadSchema, measurementUploadUpdateSchema } from "@openbts/shared/contract";
import type { MeasurementUpload, MeasurementUploadUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { canManageDevices } from "../../../../../features/measurements/devices.js";
import { excludeUploads } from "../../../../../features/measurements/exclusions.js";
import { loadCrowdSettings } from "../../../../../features/measurements/settings.js";
import { findVisibleUpload, toMeasurementUpload } from "../../../../../features/measurements/uploads.js";
import { withdrawUploads } from "../../../../../features/measurements/withdrawals.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const paramsSchema = z.object({ id: z.uuid() });
type RequestData = { Params: z.infer<typeof paramsSchema>; Body: MeasurementUploadUpdate };

const schemaRoute = {
  summary: "Withdraw or exclude an upload",
  description: "Withdrawing or excluding twice changes nothing, not even the `reason`. Both work while uploads are switched off.",
  params: paramsSchema,
  body: measurementUploadUpdateSchema,
  response: {
    200: z.object({
      data: measurementUploadSchema,
    }),
  },
};
const errorReasons = { 409: "An excluded upload cannot be withdrawn, and a withdrawn one cannot be excluded." };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<MeasurementUpload>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  const { upload, isOwn } = await findVisibleUpload(req, userId, req.params.id);
  if (req.body.status === "excluded") {
    if (!(await canManageDevices(req))) throw new ErrorResponse("FORBIDDEN", { message: "Only an administrator can exclude an upload" });
    if (upload.status === "withdrawn") throw new ErrorResponse("CONFLICT", { message: "A withdrawn upload cannot be excluded" });
    await excludeUploads(req, { uploadIds: [upload.id], reason: req.body.reason });
  } else {
    if (!isOwn) throw new ErrorResponse("FORBIDDEN", { message: "Only the person who sent an upload can withdraw it" });
    if (upload.status === "excluded") throw new ErrorResponse("CONFLICT", { message: "An excluded upload cannot be withdrawn" });
    await withdrawUploads(userId, { uploadIds: [upload.id] });
  }

  const [{ upload: updated }, settings] = await Promise.all([findVisibleUpload(req, userId, upload.id), loadCrowdSettings()]);
  return res.send({ data: toMeasurementUpload(updated, settings.rawRetentionDays) });
}

const updateMeasurementUpload: Route<RequestData, MeasurementUpload> = {
  url: "/measurements/uploads/:id",
  method: "PATCH",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default updateMeasurementUpload;
