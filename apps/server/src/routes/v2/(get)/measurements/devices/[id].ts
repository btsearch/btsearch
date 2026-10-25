import { measurementDeviceSchema } from "@openbts/shared/contract";
import type { MeasurementDevice } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { findVisibleDevice } from "../../../../../features/measurements/devices/read.js";
import { loadDeviceDetails, toMeasurementDevice } from "../../../../../features/measurements/devices/serialize.js";
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
const errorReasons = {
  404: "The device does not exist, or it is someone else's and you are not an administrator.",
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<MeasurementDevice>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  res.header("Cache-Control", "private, no-store");
  const device = await findVisibleDevice(req, userId, req.params.id);
  return res.send({ data: toMeasurementDevice(device, await loadDeviceDetails(req, [device])) });
}

const getMeasurementDevice: Route<ReqParams, MeasurementDevice> = {
  url: "/measurements/devices/:id",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMeasurementDevice;
