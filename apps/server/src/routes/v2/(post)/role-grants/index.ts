import { roleGrantCreateSchema, roleGrantSchema } from "@openbts/shared/contract";
import type { RoleGrant, RoleGrantCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { assertManagesGrant } from "../../../../features/access/grantManagement.js";
import { createRoleGrant, toRoleGrant } from "../../../../features/access/roleGrants.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { refreshUserSessions } from "../../../../plugins/auth/utils.js";
import { logger } from "../../../../utils/logger.js";

const schemaRoute = {
  summary: "Create a role grant",
  description: "If the user is not an editor yet, this also makes them one.",
  body: roleGrantCreateSchema,
  response: {
    201: z.object({
      data: roleGrantSchema,
    }),
  },
};
const errorReasons = {
  400: "The user or the country does not exist, or one of the regions is not in the grant's country.",
  403: "You need to be an administrator or a maintainer of the grant's country. Only administrators can create `maintainer` grants.",
  409: "The user is an administrator, or already has a grant with this role in this country.",
};
type ReqBody = { Body: RoleGrantCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<RoleGrant>>) {
  await assertManagesGrant(req, "create", req.body);

  try {
    const grant = await runAuditedOperation(standaloneAuditContext(req), { kind: "grant.create" }, (tx, audit) =>
      createRoleGrant(tx, audit, { ...req.body, grantedById: actorIdFromRequest(req) }),
    );
    if (grant.roleChanged) await refreshUserSessions(grant.row.userId).catch((error) => logger.error("roleGrants.refreshUserSessions", { error }));

    return res.status(201).send({ data: toRoleGrant(grant) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createGrant: Route<ReqBody, RoleGrant> = {
  url: "/role-grants",
  method: "POST",
  config: {
    permissionsCheckedByHandler: ["create:role_grants"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default createGrant;
