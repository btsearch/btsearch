import { measurementDeviceSchema, measurementDeviceUpdateSchema } from "@openbts/shared/contract";
import type { MeasurementDevice, MeasurementDeviceUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { loadDeviceDetails, toMeasurementDevice } from "../../../../../features/measurements/devices/serialize.js";
import { updateDevice } from "../../../../../features/measurements/devices/update.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const paramsSchema = z.object({ id: z.uuid() });
type RequestData = { Params: z.infer<typeof paramsSchema>; Body: MeasurementDeviceUpdate };

const schemaRoute = {
  summary: "Rename, revoke or restore a device, or set its weight",
  description:
    "Uploads from a revoked device are refused. What it uploaded before stays until you withdraw it. " +
    "Without `refold`, a weight counts only for the uploads folded after it.",
  params: paramsSchema,
  body: measurementDeviceUpdateSchema,
  response: {
    200: z.object({
      data: measurementDeviceSchema,
    }),
  },
};
const errorReasons = {
  400: "`refold` was sent for a device whose owner deleted their account.",
  403: "Also returned when you rename a device that is not yours, or restore a device, give a reason or set a weight and are not an administrator.",
  404: "The device does not exist, or it is someone else's and you are not an administrator.",
};

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<MeasurementDevice>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  const device = await updateDevice(req, userId, req.params.id, req.body);
  return res.send({ data: toMeasurementDevice(device, await loadDeviceDetails(req, [device])) });
}

const updateMeasurementDevice: Route<RequestData, MeasurementDevice> = {
  url: "/measurements/devices/:id",
  method: "PATCH",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default updateMeasurementDevice;
