import { regions } from "@openbts/drizzle";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";

const regionsSelectSchema = createSelectSchema(regions);
const regionsInsertSchema = createInsertSchema(regions).strict();
type ReqBody = { Body: z.infer<typeof regionsInsertSchema> };
type ResponseData = z.infer<typeof regionsSelectSchema>;
const schemaRoute = {
  body: regionsInsertSchema,
  response: {
    200: z.object({
      data: regionsSelectSchema,
    }),
  },
};

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { name, code } = req.body;

  try {
    const region = await runAuditedOperation(auditContextFromRequest(req), { kind: "region.create" }, async (tx, audit) => {
      const [created] = await tx
        .insert(regions)
        .values({
          name,
          code,
        })
        .returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "regions", op: "create", recordId: created.id, new: created });
      return created;
    });

    return res.send({ data: region });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createRegion: Route<ReqBody, ResponseData> = {
  url: "/regions",
  method: "POST",
  config: {
    permissions: ["create:regions"],
  },
  schema: schemaRoute,
  handler,
};

export default createRegion;
