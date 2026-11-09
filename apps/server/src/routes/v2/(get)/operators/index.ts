import { operators } from "@openbts/drizzle";
import { operatorListQuerySchema, operatorWithConventionsSchema } from "@openbts/shared/contract";
import type { OperatorListQuery, OperatorWithConventions } from "@openbts/shared/contract";
import { inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { loadOperatorConventions, withConventions } from "../../../../features/operators/conventions.js";
import { loadOperatorDetails } from "../../../../features/operators/details.js";
import { toOperator } from "../../../../features/operators/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List operators",
  description:
    "Operators are ordered by country, then by `sortPriority` (operators without one come last), then by name. " +
    "A shared network is an operator like any other, and its members are the operators whose `links` point to it.",
  querystring: operatorListQuerySchema,
  response: {
    200: z.object({
      data: z.array(operatorWithConventionsSchema),
    }),
  },
};
type ReqQuery = { Querystring: OperatorListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<OperatorWithConventions[]>>) {
  const countryCodes = await loadVisibleCountryCodes(req, req.query.countryCodes);
  if (countryCodes.length === 0) return res.send({ data: [] });

  const rows = await db
    .select()
    .from(operators)
    .where(inArray(operators.countryCode, countryCodes))
    .orderBy(operators.countryCode, sql`${operators.sortPriority} ASC NULLS LAST`, operators.name, operators.id);
  const operatorIds = rows.map((row) => row.id);
  const [details, conventions] = await Promise.all([
    loadOperatorDetails(db, operatorIds),
    loadOperatorConventions(req.query.include?.includes("conventions") ? operatorIds : []),
  ]);

  return res.send({ data: rows.map((row) => withConventions(toOperator(row, details.get(row.id)), conventions)) });
}

const getOperators: Route<ReqQuery, OperatorWithConventions[]> = {
  url: "/operators",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getOperators;
