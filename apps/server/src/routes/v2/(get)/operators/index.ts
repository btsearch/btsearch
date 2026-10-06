import { operators } from "@openbts/drizzle";
import { operatorListQuerySchema, operatorSchema } from "@openbts/shared/contract";
import type { Operator, OperatorListQuery } from "@openbts/shared/contract";
import { inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { loadOperatorDetails } from "../../../../features/operators/details.js";
import { toOperator } from "../../../../features/operators/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List operators",
  description:
    "Returns all operators, ordered by country, then by `sortPriority` (operators without one come last), then by name. " +
    "Operators in hidden countries are only included for administrators and for editors with a grant in that country. " +
    "A shared network is an operator like any other, and its members are the operators whose `links` point to it.",
  querystring: operatorListQuerySchema,
  response: {
    200: z.object({
      data: z.array(operatorSchema),
    }),
  },
};
type ReqQuery = { Querystring: OperatorListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<Operator[]>>) {
  const countryCodes = await loadVisibleCountryCodes(req, req.query.countryCodes);
  if (countryCodes.length === 0) return res.send({ data: [] });

  const rows = await db
    .select()
    .from(operators)
    .where(inArray(operators.countryCode, countryCodes))
    .orderBy(operators.countryCode, sql`${operators.sortPriority} ASC NULLS LAST`, operators.name, operators.id);
  const details = await loadOperatorDetails(
    db,
    rows.map((row) => row.id),
  );

  return res.send({ data: rows.map((row) => toOperator(row, details.get(row.id))) });
}

const getOperators: Route<ReqQuery, Operator[]> = {
  url: "/operators",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getOperators;
