import { userLists } from "@openbts/drizzle";
import { listParamsSchema, noContentSchema } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { assertListsEnabled, findListForViewer } from "../../../../features/lists/visibility.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a list",
  description: "Deletes a list. You need to be the owner or an administrator.",
  params: listParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  403: "Lists are disabled, or the list is not yours and you are not an administrator.",
  404: "The list does not exist, or it is private and not yours.",
};
type ReqParams = { Params: z.infer<typeof listParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  assertListsEnabled();
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const list = await findListForViewer(req, req.params.id, userId);
  if (list.created_by !== userId && !(await hasStaffPermission(req, { user_lists: ["manage_all"] }))) throw new ErrorResponse("FORBIDDEN");

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "list.delete" }, async (tx, audit) => {
      await tx.delete(userLists).where(eq(userLists.id, list.id));
      await audit.log({ entity: "user_lists", op: "delete", recordId: list.id, old: list });
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteList: Route<ReqParams, void> = {
  url: "/lists/:id",
  method: "DELETE",
  config: { permissions: ["delete:user_lists"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default deleteList;
