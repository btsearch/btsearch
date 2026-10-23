import { measurementDeviceSchema, measurementDeviceUpdateSchema } from "@openbts/shared/contract";
import type { MeasurementDevice, MeasurementDeviceUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { toMeasurementDevice, updateDevice } from "../../../../../features/measurements/devices.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const paramsSchema = z.object({ id: z.uuid() });
type RequestData = { Params: z.infer<typeof paramsSchema>; Body: MeasurementDeviceUpdate };

const schemaRoute = {
  summary: "Rename, revoke or restore a device",
  description: "Uploads from a revoked device are refused; what it uploaded before stays until you withdraw it.",
  params: paramsSchema,
  body: measurementDeviceUpdateSchema,
  response: {
    200: z.object({
      data: measurementDeviceSchema,
    }),
  },
};

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<MeasurementDevice>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  return res.send({ data: toMeasurementDevice(await updateDevice(req, userId, req.params.id, req.body)) });
}

const updateMeasurementDevice: Route<RequestData, MeasurementDevice> = {
  url: "/measurements/devices/:id",
  method: "PATCH",
  config: { permissions: ["upload:observations"], callers: ["app", "session"] },
  schema: schemaRoute,
  handler,
};

export default updateMeasurementDevice;
