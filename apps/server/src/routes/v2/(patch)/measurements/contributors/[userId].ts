import { measurementContributorParamsSchema, measurementContributorSchema, measurementContributorUpdateSchema } from "@openbts/shared/contract";
import type { MeasurementContributor, MeasurementContributorUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { updateContributor } from "../../../../../features/measurements/contributors/update.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type RequestData = { Params: z.infer<typeof measurementContributorParamsSchema>; Body: MeasurementContributorUpdate };

const schemaRoute = {
  summary: "Vouch for or block a contributor",
  description: "Without `refold`, a vouch weighs only the uploads folded after it.",
  tags: ["measurement-administration"],
  params: measurementContributorParamsSchema,
  body: measurementContributorUpdateSchema,
  response: {
    200: z.object({
      data: measurementContributorSchema,
    }),
  },
};
const errorReasons = {
  400: "`vouch.endsAt` or `block.endsAt` does not lie in the future.",
  404: "The person has not accepted the contributor terms.",
};

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<MeasurementContributor>>) {
  return res.send({ data: await updateContributor(req, req.params.userId, req.body) });
}

const updateMeasurementContributor: Route<RequestData, MeasurementContributor> = {
  url: "/measurements/contributors/:userId",
  method: "PATCH",
  config: { permissions: ["manage:observations"], callers: ["session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default updateMeasurementContributor;
