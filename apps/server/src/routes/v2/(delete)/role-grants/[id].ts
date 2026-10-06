import { noContentSchema, roleGrantParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { assertManagesStoredGrant } from "../../../../features/access/grantManagement.js";
import { deleteRoleGrant } from "../../../../features/access/roleGrants.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";
import { refreshUserSessions } from "../../../../plugins/auth/utils.js";
import { logger } from "../../../../utils/logger.js";

const schemaRoute = {
  summary: "Delete a role grant",
  description:
    "Deletes the grant. If it was the user's last grant, they stop being an editor. " +
    "Administrators can delete any grant. Maintainers can only delete `editor` grants in a country they maintain.",
  params: roleGrantParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  403: "You need to be an administrator or a maintainer of the grant's country. Only administrators can delete `maintainer` grants.",
  404: "The grant does not exist.",
};
type ReqParams = { Params: z.infer<typeof roleGrantParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  await assertManagesStoredGrant(req, "delete", req.params.id);

  try {
    const deleted = await runAuditedOperation(standaloneAuditContext(req), { kind: "grant.delete" }, (tx, audit) =>
      deleteRoleGrant(tx, audit, req.params.id),
    );
    if (deleted.roleChanged) await refreshUserSessions(deleted.userId).catch((error) => logger.error("roleGrants.refreshUserSessions", { error }));

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
}

const deleteGrant: Route<ReqParams, void> = {
  url: "/role-grants/:id",
  method: "DELETE",
  config: {
    permissionsCheckedByHandler: ["delete:role_grants"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default deleteGrant;
