import { measurementContributorParamsSchema, measurementContributorSchema } from "@openbts/shared/contract";
import type { MeasurementContributor } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { findContributor } from "../../../../../features/measurements/contributors/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqParams = { Params: z.infer<typeof measurementContributorParamsSchema> };

const schemaRoute = {
  summary: "Get a contributor",
  description: "You can read anyone who accepted the contributor terms, uploads or not.",
  tags: ["measurement-administration"],
  params: measurementContributorParamsSchema,
  response: {
    200: z.object({
      data: measurementContributorSchema,
    }),
  },
};
const errorReasons = {
  404: "The person has not accepted the contributor terms.",
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<MeasurementContributor>>) {
  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await findContributor(req.params.userId) });
}

const getMeasurementContributor: Route<ReqParams, MeasurementContributor> = {
  url: "/measurements/contributors/:userId",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMeasurementContributor;
