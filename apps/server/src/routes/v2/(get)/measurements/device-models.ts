import { measurementDeviceModelListQuerySchema, measurementDeviceModelListSchema } from "@openbts/shared/contract";
import type { MeasurementDeviceModelList, MeasurementDeviceModelListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { findDeviceModelPage } from "../../../../features/measurements/devices/hardware.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

type ReqQuery = { Querystring: MeasurementDeviceModelListQuery };

const schemaRoute = {
  summary: "List the phone models",
  description: "Every phone model a device was registered with, sorted by manufacturer and model. A reading block takes one by its `deviceModelId`.",
  tags: ["measurement-administration"],
  querystring: measurementDeviceModelListQuerySchema,
  response: { 200: measurementDeviceModelListSchema },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
};

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<MeasurementDeviceModelList>>) {
  const page = await findDeviceModelPage(req.query);
  return res.send({ data: page.data, paging: { limit: req.query.limit, nextCursor: page.nextCursor } });
}

const getMeasurementDeviceModels: Route<ReqQuery, MeasurementDeviceModelList> = {
  url: "/measurements/device-models",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMeasurementDeviceModels;
