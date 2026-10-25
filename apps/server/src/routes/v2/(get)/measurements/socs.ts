import { measurementSocListSchema } from "@openbts/shared/contract";
import type { MeasurementSoc } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { listSocs } from "../../../../features/measurements/devices/hardware.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List the SoCs",
  description: "Every SoC a registered phone has named. A reading block takes one by its `socId`.",
  tags: ["measurement-administration"],
  querystring: z.object({}).strict(),
  response: { 200: measurementSocListSchema },
};

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<MeasurementSoc[]>>) {
  return res.send({ data: await listSocs() });
}

const getMeasurementSocs: Route<RouteGenericInterface, MeasurementSoc[]> = {
  url: "/measurements/socs",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementSocs;
