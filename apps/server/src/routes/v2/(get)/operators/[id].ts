import { operatorParamsSchema, operatorQuerySchema, operatorWithConventionsSchema } from "@openbts/shared/contract";
import type { OperatorQuery, OperatorWithConventions } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { assertCountryVisible } from "../../../../features/countries/visibility.js";
import { loadOperatorConventions, withConventions } from "../../../../features/operators/conventions.js";
import { loadOperators } from "../../../../features/operators/details.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an operator",
  params: operatorParamsSchema,
  querystring: operatorQuerySchema,
  response: {
    200: z.object({
      data: operatorWithConventionsSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof operatorParamsSchema> };
type ReqQuery = { Querystring: OperatorQuery };
type RequestData = ReqParams & ReqQuery;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<OperatorWithConventions>>) {
  const { id } = req.params;

  const [operators, conventions] = await Promise.all([
    loadOperators(db, [id]),
    loadOperatorConventions(req.query.include?.includes("conventions") ? [id] : []),
  ]);
  const operator = operators.get(id);
  if (!operator) throw new ErrorResponse("NOT_FOUND");
  await assertCountryVisible(req, operator.countryCode);

  return res.send({ data: withConventions(operator, conventions) });
}

const getOperator: Route<RequestData, OperatorWithConventions> = {
  url: "/operators/:id",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getOperator;
