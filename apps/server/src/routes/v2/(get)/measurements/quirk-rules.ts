import { measurementQuirkRuleListSchema } from "@openbts/shared/contract";
import type { MeasurementQuirkRule } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { listQuirkRules } from "../../../../features/measurements/readers/quirkRules.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List the quirk rules",
  description: "Every rule an upload has applied to correct a reader's values, blocked ones included.",
  tags: ["measurement-administration"],
  querystring: z.object({}).strict(),
  response: { 200: measurementQuirkRuleListSchema },
};

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<MeasurementQuirkRule[]>>) {
  return res.send({ data: await listQuirkRules() });
}

const getMeasurementQuirkRules: Route<RouteGenericInterface, MeasurementQuirkRule[]> = {
  url: "/measurements/quirk-rules",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementQuirkRules;
