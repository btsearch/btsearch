import { measurementDeviceSchema } from "@openbts/shared/contract";
import type { MeasurementDevice } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { findVisibleDevice, toMeasurementDevice } from "../../../../../features/measurements/devices.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const paramsSchema = z.object({ id: z.uuid() });
type ReqParams = { Params: z.infer<typeof paramsSchema> };

const schemaRoute = {
  summary: "Get a device",
  description: "Administrators can read any device.",
  params: paramsSchema,
  response: {
    200: z.object({
      data: measurementDeviceSchema,
    }),
  },
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<MeasurementDevice>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  return res.send({ data: toMeasurementDevice(await findVisibleDevice(req, userId, req.params.id)) });
}

const getMeasurementDevice: Route<ReqParams, MeasurementDevice> = {
  url: "/measurements/devices/:id",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementDevice;
