import {
  measurementUploadConflictSchema,
  measurementUploadFileGoneSchema,
  measurementUploadSchema,
  measurementUploadUpdateSchema,
} from "@openbts/shared/contract";
import type { MeasurementUpload, MeasurementUploadUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { loadCrowdSettings } from "../../../../../features/measurements/settings.js";
import { findVisibleUpload } from "../../../../../features/measurements/uploads/read.js";
import { toMeasurementUpload } from "../../../../../features/measurements/uploads/serialize.js";
import { updateUpload } from "../../../../../features/measurements/uploads/update.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const paramsSchema = z.object({ id: z.uuid() });
type RequestData = { Params: z.infer<typeof paramsSchema>; Body: MeasurementUploadUpdate };

const schemaRoute = {
  summary: "Withdraw, exclude or restore an upload",
  description:
    "Withdrawing or excluding twice changes nothing, not even the `reason`. All three work while uploads are switched off. " +
    "The answer has the upload's `status` after the change: a restored upload is `processed` again, or `received` if it was never folded.",
  params: paramsSchema,
  body: measurementUploadUpdateSchema,
  response: {
    200: z.object({
      data: measurementUploadSchema,
    }),
  },
};
const errorBodies = {
  409: z.object({
    errors: z.array(z.object({ code: z.literal("CONFLICT"), message: z.string(), details: z.array(measurementUploadConflictSchema) })).min(1),
  }),
  410: z.object({
    errors: z.array(z.object({ code: z.literal("GONE"), message: z.string(), details: z.array(measurementUploadFileGoneSchema) })).min(1),
  }),
};
const errorReasons = {
  409:
    "`details[0].kind` says why: `excluded` when you withdraw an excluded upload, `withdrawn` when you exclude a withdrawn one, " +
    "and `notExcluded` when you restore an upload that is not excluded.",
  410: "The excluded upload's file is deleted, so it cannot be restored.",
};

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<MeasurementUpload>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  await updateUpload(req, userId, req.params.id, req.body);
  const [updated, settings] = await Promise.all([findVisibleUpload(req, userId, req.params.id), loadCrowdSettings()]);
  return res.send({ data: await toMeasurementUpload(req, updated, settings.rawRetentionDays) });
}

const updateMeasurementUpload: Route<RequestData, MeasurementUpload> = {
  url: "/measurements/uploads/:id",
  method: "PATCH",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorBodies, errorReasons },
  schema: schemaRoute,
  handler,
};

export default updateMeasurementUpload;
