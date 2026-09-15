import { bands } from "@openbts/drizzle";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";

const bandsSelectSchema = createSelectSchema(bands);
const bandsInsertSchema = createInsertSchema(bands).strict();
type ReqBody = { Body: z.infer<typeof bandsInsertSchema> };
type ResponseData = z.infer<typeof bandsSelectSchema>;
const schemaRoute = {
  body: bandsInsertSchema,
  response: {
    200: z.object({
      data: bandsSelectSchema,
    }),
  },
};

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  try {
    const band = await runAuditedOperation(auditContextFromRequest(req), { kind: "band.create" }, async (tx, audit) => {
      const [created] = await tx.insert(bands).values(req.body).returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "bands", op: "create", recordId: created.id, new: created });
      return created;
    });

    return res.send({ data: band });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createBand: Route<ReqBody, ResponseData> = {
  url: "/bands",
  method: "POST",
  config: {
    permissions: ["create:bands"],
  },
  schema: schemaRoute,
  handler,
};

export default createBand;
