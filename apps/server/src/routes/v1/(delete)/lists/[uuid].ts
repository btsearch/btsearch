import { userLists } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../plugins/auth/utils.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";

const schemaRoute = {
  params: z.object({
    uuid: z.string(),
  }),
};

type ReqParams = { Params: { uuid: string } };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
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

  await runAuditedOperation(auditContextFromRequest(req), { kind: "list.delete" }, async (tx, audit) => {
    await tx.delete(userLists).where(eq(userLists.uuid, uuid));
    await audit.log({ entity: "user_lists", op: "delete", recordId: list.id, old: list });
  }).catch((error) => {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE");
  });

  return res.status(204).send();
}

const deleteList: Route<ReqParams, void> = {
  url: "/lists/:uuid",
  method: "DELETE",
  config: { permissions: ["delete:user_lists"] },
  schema: schemaRoute,
  handler,
};

export default deleteList;
