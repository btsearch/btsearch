import { measurementUploadSchema } from "@openbts/shared/contract";
import type { MeasurementUpload } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { loadCrowdSettings } from "../../../../../features/measurements/settings.js";
import { findVisibleUpload } from "../../../../../features/measurements/uploads/read.js";
import { toMeasurementUpload } from "../../../../../features/measurements/uploads/serialize.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const paramsSchema = z.object({ id: z.uuid() });
type ReqParams = { Params: z.infer<typeof paramsSchema> };

const schemaRoute = {
  summary: "Get an upload",
  description: "Administrators can read any upload.",
  params: paramsSchema,
  response: {
    200: z.object({
      data: measurementUploadSchema,
    }),
  },
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<MeasurementUpload>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  const [stored, settings] = await Promise.all([findVisibleUpload(req, userId, req.params.id), loadCrowdSettings()]);
  return res.send({ data: await toMeasurementUpload(req, stored, settings.rawRetentionDays) });
}

const getMeasurementUpload: Route<ReqParams, MeasurementUpload> = {
  url: "/measurements/uploads/:id",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementUpload;
