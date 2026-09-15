import { regions } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";

const regionsUpdateSchema = createUpdateSchema(regions).strict();
const regionsSelectSchema = createSelectSchema(regions);
const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  body: regionsUpdateSchema,
  response: {
    200: z.object({
      data: regionsSelectSchema,
    }),
  },
};
type ReqBody = { Body: z.infer<typeof regionsUpdateSchema> };
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof regionsSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { id } = req.params;

  const region = await db.query.regions.findFirst({
    where: {
      id,
    },
  });
  if (!region) throw new ErrorResponse("NOT_FOUND");

  try {
    const updated = await runAuditedOperation(auditContextFromRequest(req), { kind: "region.update" }, async (tx, audit) => {
      const [result] = await tx.update(regions).set(req.body).where(eq(regions.id, id)).returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "regions", op: "update", recordId: id, old: region, new: result });
      return result;
    });

    return res.send({ data: updated });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateRegion: Route<RequestData, ResponseData> = {
  url: "/regions/:id",
  method: "PATCH",
  config: {
    permissions: ["update:regions"],
  },
  schema: schemaRoute,
  handler,
};

export default updateRegion;
