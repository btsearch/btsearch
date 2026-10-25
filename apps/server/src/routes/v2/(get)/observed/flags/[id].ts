import { observationFlagParamsSchema, observationFlagQuerySchema, observationFlagSchema } from "@openbts/shared/contract";
import type { ObservationFlag, ObservationFlagQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { readFlag } from "../../../../../features/observed/flags/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a flag",
  params: observationFlagParamsSchema,
  querystring: observationFlagQuerySchema,
  response: {
    200: z.object({
      data: observationFlagSchema,
    }),
  },
};
const errorReasons = {
  403: "Observed data is switched off and you are not an administrator.",
  404: "The flag does not exist, or it is not one you get in `GET /observed/flags`.",
};
type RequestData = { Params: z.infer<typeof observationFlagParamsSchema>; Querystring: ObservationFlagQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ObservationFlag>>) {
  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await readFlag(req, req.params.id, req.query.include) });
}

const getObservationFlag: Route<RequestData, ObservationFlag> = {
  url: "/observed/flags/:id",
  method: "GET",
  config: { permissionsCheckedByHandler: ["moderate:observations"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservationFlag;
