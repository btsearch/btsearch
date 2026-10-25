import { observationEvaluationDetailSchema, observationEvaluationParamsSchema } from "@openbts/shared/contract";
import type { ObservationEvaluationDetail } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { fetchEvaluationDetail } from "../../../../../features/observed/engine/evaluations.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqParams = { Params: z.infer<typeof observationEvaluationParamsSchema> };

const schemaRoute = {
  summary: "Get a nightly evaluation",
  description:
    "The night's scores per technology, area, evidence, timing-advance group, reader and country, beside the baseline. " +
    "Also how its snaps and groups turned out, the reader scores, the gNBID length test and the calibration it used.",
  tags: ["observation-engine"],
  params: observationEvaluationParamsSchema,
  response: {
    200: z.object({
      data: observationEvaluationDetailSchema,
    }),
  },
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ObservationEvaluationDetail>>) {
  res.header("Cache-Control", "private, no-store");
  const evaluation = await fetchEvaluationDetail(req.params.id);
  if (evaluation === null) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: evaluation });
}

const getObservationEvaluation: Route<ReqParams, ObservationEvaluationDetail> = {
  url: "/observed/evaluations/:id",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default getObservationEvaluation;
