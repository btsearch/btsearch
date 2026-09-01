import { bands } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";

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
    const [updated] = await db.update(bands).set(req.body).where(eq(bands.id, id)).returning();
    if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");
    await createAuditLog({ action: "bands.update", table_name: "bands", record_id: id, old_values: band, new_values: updated }, req);

    return res.send({ data: updated });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateBand: Route<RequestData, ResponseData> = {
  url: "/bands/:id",
  method: "PATCH",
  config: { permissions: ["write:bands"] },
  schema: schemaRoute,
  handler,
};

export default updateBand;
