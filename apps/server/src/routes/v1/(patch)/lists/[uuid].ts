import { userLists } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../plugins/auth/utils.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";

const updateSchema = createUpdateSchema(userLists, {
  stations: z.object({ internal: z.array(z.number()), uke: z.array(z.number()) }).optional(),
  radiolines: z.array(z.number()).optional(),
}).omit({
  uuid: true,
  created_by: true,
  createdAt: true,
  updatedAt: true,
});
const selectSchema = createSelectSchema(userLists);

const schemaRoute = {
  params: z.object({
    uuid: z.string(),
  }),
  body: updateSchema,
  response: {
    200: z.object({
      data: selectSchema,
    }),
  },
};

type ReqBody = { Body: z.infer<typeof updateSchema> };
type ReqParams = { Params: { uuid: string } };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof selectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  if (!getRuntimeSettings().enableUserLists) throw new ErrorResponse("FORBIDDEN");
  if (!req.userSession) throw new ErrorResponse("UNAUTHORIZED");

  const { uuid } = req.params;
  const userId = req.userSession.user.id;

  const [list, isAdmin] = await Promise.all([
    db.query.userLists.findFirst({ where: { uuid } }),
    verifyPermissions(userId, { user_lists: ["manage_all"] }),
  ]);
  if (!list) throw new ErrorResponse("NOT_FOUND");
  if (!isAdmin && list.created_by !== userId) throw new ErrorResponse("FORBIDDEN");

  const updated = await runAuditedOperation(auditContextFromRequest(req), { kind: "list.update" }, async (tx, audit) => {
    const [result] = await tx
      .update(userLists)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(userLists.uuid, uuid))
      .returning();
    if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

    await audit.log({ entity: "user_lists", op: "update", recordId: result.id, old: list, new: result });
    return result;
  }).catch((error) => {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE");
  });

  return res.send({ data: updated });
}

const updateList: Route<RequestData, ResponseData> = {
  url: "/lists/:uuid",
  method: "PATCH",
  config: { permissions: ["update:user_lists"] },
  schema: schemaRoute,
  handler,
};

export default updateList;
