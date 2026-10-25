import { observationEvaluationListQuerySchema, observationEvaluationListSchema } from "@openbts/shared/contract";
import type { ObservationEvaluationList, ObservationEvaluationListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchEvaluationPage } from "../../../../../features/observed/engine/evaluations.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqQuery = { Querystring: ObservationEvaluationListQuery };

const schemaRoute = {
  summary: "List the nightly evaluations",
  description:
    "Each night the engine scores its estimates against the confirmed stations of one half, after calibrating on the other half. " +
    "Returns the nights newest first, each with its overall scores. Get a night by id for the rest of its report.",
  tags: ["observation-engine"],
  querystring: observationEvaluationListQuerySchema,
  response: {
    200: observationEvaluationListSchema,
  },
};
const errorReasons = { 400: "The `cursor` is invalid." };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ObservationEvaluationList>>) {
  res.header("Cache-Control", "private, no-store");
  return res.send(await fetchEvaluationPage(req.query));
}

const getObservationEvaluations: Route<ReqQuery, ObservationEvaluationList> = {
  url: "/observed/evaluations",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservationEvaluations;
