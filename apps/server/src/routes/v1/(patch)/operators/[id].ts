import { operators } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";

const operatorsUpdateSchema = createUpdateSchema(operators).strict();
const operatorsSelectSchema = createSelectSchema(operators);
const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  body: operatorsUpdateSchema,
  response: {
    200: z.object({
      data: operatorsSelectSchema,
    }),
  },
};
type ReqBody = { Body: z.infer<typeof operatorsUpdateSchema> };
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof operatorsSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { id } = req.params;

  const operator = await db.query.operators.findFirst({
    where: {
      id,
    },
  });
  if (!operator) throw new ErrorResponse("NOT_FOUND");

  try {
    const [updated] = await db.update(operators).set(req.body).where(eq(operators.id, id)).returning();
    if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");
    await createAuditLog({ action: "operators.update", table_name: "operators", record_id: id, old_values: operator, new_values: updated }, req);

    return res.send({ data: updated });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateOperator: Route<RequestData, ResponseData> = {
  url: "/operators/:id",
  method: "PATCH",
  config: { permissions: ["write:operators"] },
  schema: schemaRoute,
  handler,
};

export default updateOperator;
