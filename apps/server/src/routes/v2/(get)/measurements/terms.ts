import { measurementTermsSchema } from "@openbts/shared/contract";
import type { MeasurementTerms } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { findTerms } from "../../../../features/measurements/terms.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get the contributor terms you accepted",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: measurementTermsSchema,
    }),
  },
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<MeasurementTerms>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  return res.send({ data: await findTerms(userId) });
}

const getMeasurementTerms: Route<RouteGenericInterface, MeasurementTerms> = {
  url: "/measurements/terms",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementTerms;
