import { bands } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";

const bandsUpdateSchema = createUpdateSchema(bands);
const bandsSelectSchema = createSelectSchema(bands);
const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  body: bandsUpdateSchema,
  response: {
    200: z.object({
      data: bandsSelectSchema,
    }),
  },
};
type ReqBody = { Body: z.infer<typeof bandsUpdateSchema> };
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof bandsSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { id } = req.params;

  const band = await db.query.bands.findFirst({
    where: {
      id,
    },
  });
  if (!band) throw new ErrorResponse("NOT_FOUND");

  try {
    const updated = await runAuditedOperation(auditContextFromRequest(req), { kind: "band.update" }, async (tx, audit) => {
      const [result] = await tx.update(bands).set(req.body).where(eq(bands.id, id)).returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "bands", op: "update", recordId: id, old: band, new: result });
      return result;
    });

    return res.send({ data: updated });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateBand: Route<RequestData, ResponseData> = {
  url: "/bands/:id",
  method: "PATCH",
  config: {
    permissions: ["update:bands"],
  },
  schema: schemaRoute,
  handler,
};

export default updateBand;
