import { operators } from "@openbts/drizzle";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";

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
    const operator = await runAuditedOperation(auditContextFromRequest(req), { kind: "operator.create" }, async (tx, audit) => {
      const [created] = await tx.insert(operators).values(req.body).returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "operators", op: "create", recordId: created.id, new: created });
      return created;
    });

    return res.send({ data: operator });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createOperator: Route<ReqBody, ResponseData> = {
  url: "/operators",
  method: "POST",
  config: {
    permissions: ["create:operators"],
  },
  schema: schemaRoute,
  handler,
};

export default createOperator;
