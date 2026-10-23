import { measurementConfigSchema } from "@openbts/shared/contract";
import type { MeasurementConfig } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadCrowdSettings, toMeasurementConfig } from "../../../../features/measurements/settings.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get the upload settings",
  description: "What the app needs before it signs in, registers a device or uploads.",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: measurementConfigSchema,
    }),
  },
};

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<MeasurementConfig>>) {
  return res.send({ data: toMeasurementConfig(await loadCrowdSettings()) });
}

const getMeasurementConfig: Route<RouteGenericInterface, MeasurementConfig> = {
  url: "/measurements/config",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getMeasurementConfig;
