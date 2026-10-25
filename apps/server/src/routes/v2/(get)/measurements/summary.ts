import { measurementSummarySchema } from "@openbts/shared/contract";
import type { MeasurementSummary } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { findSummary } from "../../../../features/measurements/summary.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get your measurement totals",
  description: "A withdrawn or excluded upload stops counting at once. Your ranks are those of the leaderboards, which are worked out once a day.",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: measurementSummarySchema,
    }),
  },
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<MeasurementSummary>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await findSummary(userId) });
}

const getMeasurementSummary: Route<RouteGenericInterface, MeasurementSummary> = {
  url: "/measurements/summary",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementSummary;
