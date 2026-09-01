import { operators } from "@openbts/drizzle";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";

const operatorsSelectSchema = createSelectSchema(operators);
const operatorsInsertSchema = createInsertSchema(operators).strict();
type ReqBody = { Body: z.infer<typeof operatorsInsertSchema> };
type ResponseData = z.infer<typeof operatorsSelectSchema>;
const schemaRoute = {
  body: operatorsInsertSchema,
  response: {
    200: z.object({
      data: operatorsSelectSchema,
    }),
  },
};

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  try {
    const [operator] = await db.insert(operators).values(req.body).returning();

    if (!operator) throw new ErrorResponse("FAILED_TO_CREATE");
    await createAuditLog(
      { action: "operators.create", table_name: "operators", record_id: operator.id, old_values: null, new_values: operator },
      req,
    );
    return res.send({ data: operator });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createOperator: Route<ReqBody, ResponseData> = {
  url: "/operators",
  method: "POST",
  config: { permissions: ["write:operators"] },
  schema: schemaRoute,
  handler,
};

export default createOperator;
