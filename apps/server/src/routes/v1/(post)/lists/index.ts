import { userLists } from "@openbts/drizzle";
import { count, eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";

const insertSchema = createInsertSchema(userLists, {
  stations: z.object({ internal: z.array(z.number()), uke: z.array(z.number()) }),
  radiolines: z.array(z.number()),
}).omit({
  uuid: true,
  createdAt: true,
  updatedAt: true,
  created_by: true,
});
const selectSchema = createSelectSchema(userLists);

const schemaRoute = {
  body: insertSchema,
  response: {
    200: z.object({
      data: selectSchema,
    }),
  },
};

type ReqBody = { Body: z.infer<typeof insertSchema> };
type ResponseData = z.infer<typeof selectSchema>;

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  if (!getRuntimeSettings().enableUserLists) throw new ErrorResponse("FORBIDDEN");
  if (!req.userSession) throw new ErrorResponse("UNAUTHORIZED");

  const userId = req.userSession.user.id;

  const [listCountRow] = await db.select({ count: count() }).from(userLists).where(eq(userLists.created_by, userId));
  if ((listCountRow?.count ?? 0) >= 10) throw new ErrorResponse("BAD_REQUEST", { message: "You have reached the maximum limit of 10 lists" });

  const created = await runAuditedOperation(auditContextFromRequest(req), { kind: "list.create" }, async (tx, audit) => {
    const [result] = await tx
      .insert(userLists)
      .values({
        ...req.body,
        radiolines: req.body.radiolines ?? [],
        created_by: userId,
      })
      .returning();
    if (!result) throw new ErrorResponse("FAILED_TO_CREATE");

    await audit.log({ entity: "user_lists", op: "create", recordId: result.id, new: result });
    return result;
  }).catch((error) => {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE");
  });

  return res.send({ data: created });
}

const createList: Route<ReqBody, ResponseData> = {
  url: "/lists",
  method: "POST",
  config: { permissions: ["create:user_lists"] },
  schema: schemaRoute,
  handler,
};

export default createList;
