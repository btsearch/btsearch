import { measurementQuirkRuleParamsSchema, measurementQuirkRuleSchema, measurementQuirkRuleUpdateSchema } from "@openbts/shared/contract";
import type { MeasurementQuirkRule, MeasurementQuirkRuleUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { updateQuirkRule } from "../../../../../features/measurements/readers/quirkRules.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type RequestData = { Params: z.infer<typeof measurementQuirkRuleParamsSchema>; Body: MeasurementQuirkRuleUpdate };

const schemaRoute = {
  summary: "Block or unblock a quirk rule",
  description:
    "The values a blocked rule corrected are left out of every upload folded from then on. Blocking twice changes nothing, not even the `reason`.",
  tags: ["measurement-administration"],
  params: measurementQuirkRuleParamsSchema,
  body: measurementQuirkRuleUpdateSchema,
  response: {
    200: z.object({
      data: measurementQuirkRuleSchema,
    }),
  },
};

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<MeasurementQuirkRule>>) {
  return res.send({ data: await updateQuirkRule(req, req.params.id, req.body) });
}

const updateMeasurementQuirkRule: Route<RequestData, MeasurementQuirkRule> = {
  url: "/measurements/quirk-rules/:id",
  method: "PATCH",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default updateMeasurementQuirkRule;
