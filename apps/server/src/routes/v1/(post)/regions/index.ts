import { regions } from "@openbts/drizzle";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";

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
    const [region] = await db
      .insert(regions)
      .values({
        name,
        code,
      })
      .returning();

    if (!region) throw new ErrorResponse("FAILED_TO_CREATE");
    await createAuditLog({ action: "regions.create", table_name: "regions", record_id: region.id, old_values: null, new_values: region }, req);
    return res.send({ data: region });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createRegion: Route<ReqBody, ResponseData> = {
  url: "/regions",
  method: "POST",
  config: { permissions: ["write:regions"] },
  schema: schemaRoute,
  handler,
};

export default createRegion;
