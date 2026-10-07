import { operators } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { IdParams, JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const operatorsSchema = createSelectSchema(operators);
const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({
      data: operatorsSchema,
    }),
  },
};
type ResponseData = z.infer<typeof operatorsSchema>;

async function handler(req: FastifyRequest<IdParams>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { id } = req.params;

  const operator = await db.query.operators.findFirst({
    where: {
      id: id,
      countryCode: LEGACY_COUNTRY_CODE,
    },
  });
  if (!operator) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: operator });
}

const getOperator: Route<IdParams, ResponseData> = {
  url: "/operators/:id",
  method: "GET",
  config: { permissions: ["read:operators"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getOperator;
