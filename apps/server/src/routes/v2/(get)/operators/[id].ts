import { operatorParamsSchema, operatorSchema } from "@openbts/shared/contract";
import type { Operator } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { assertCountryVisible } from "../../../../features/countries/visibility.js";
import { loadOperators } from "../../../../features/operators/details.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an operator",
  params: operatorParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: operatorSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof operatorParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Operator>>) {
  const { id } = req.params;

  const operator = (await loadOperators(db, [id])).get(id);
  if (!operator) throw new ErrorResponse("NOT_FOUND");
  await assertCountryVisible(req, operator.countryCode);

  return res.send({ data: operator });
}

const getOperator: Route<ReqParams, Operator> = {
  url: "/operators/:id",
  method: "GET",
  config: {
    allowGuestAccess: true,
    errorReasons: { 404: "The operator does not exist, or it is in a country you cannot access." },
  },
  schema: schemaRoute,
  handler,
};

export default getOperator;
