import { observedEstimatorSchema } from "@openbts/shared/contract";
import type { ObservedEstimator } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertPublicObservationsOn } from "../../../../features/observed/access.js";
import { ESTIMATOR_CACHE_CONTROL, loadEstimator } from "../../../../features/observed/estimator.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get the estimator's calibration",
  description:
    "The calibration that new site estimates are made with, so that you can estimate a site from your own readings as the server does. " +
    "Your phone's timing-advance calibration and error models are on its device, in `GET /measurements/devices/{id}`. " +
    "Each value is the newest one fitted in the 7 nights up to the newest calibration run. Estimates made earlier keep the calibration they were made with. " +
    "The answer is the same for everyone and can be up to an hour old.",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: observedEstimatorSchema,
    }),
  },
};
const errorReasons = {
  403: "Observed data is switched off.",
};

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<ObservedEstimator>>) {
  assertPublicObservationsOn();
  const estimator = await loadEstimator();
  res.header("Cache-Control", ESTIMATOR_CACHE_CONTROL);
  return res.send({ data: estimator });
}

const getObservedEstimator: Route<RouteGenericInterface, ObservedEstimator> = {
  url: "/observed/estimator",
  method: "GET",
  config: { permissions: ["read:observations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservedEstimator;
