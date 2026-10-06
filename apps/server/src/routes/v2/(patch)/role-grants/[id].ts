import { roleGrantParamsSchema, roleGrantSchema, roleGrantUpdateSchema } from "@openbts/shared/contract";
import type { RoleGrant, RoleGrantUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { assertManagesStoredGrant } from "../../../../features/access/grantManagement.js";
import { toRoleGrant, updateRoleGrantRegions } from "../../../../features/access/roleGrants.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a role grant",
  description:
    "Replaces the regions a grant is limited to. Send `null` to make it cover the whole country. " +
    "A `maintainer` grant always covers the whole country, so it only accepts `null`. " +
    "The user, role and country of a grant cannot be changed. " +
    "Administrators can update any grant. Maintainers can only update `editor` grants in a country they maintain.",
  params: roleGrantParamsSchema,
  body: roleGrantUpdateSchema,
  response: {
    200: z.object({
      data: roleGrantSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, one of the regions is not in the grant's country, or you sent regions for a `maintainer` grant.",
  403: "You need to be an administrator or a maintainer of the grant's country. Only administrators can update `maintainer` grants.",
  404: "The grant does not exist.",
};
type ReqBody = { Body: RoleGrantUpdate };
type ReqParams = { Params: z.infer<typeof roleGrantParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<RoleGrant>>) {
  await assertManagesStoredGrant(req, "update", req.params.id);

  try {
    const grant = await runAuditedOperation(standaloneAuditContext(req), { kind: "grant.update" }, (tx, audit) =>
      updateRoleGrantRegions(tx, audit, req.params.id, req.body.regionIds),
    );

    return res.send({ data: toRoleGrant(grant) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateGrant: Route<RequestData, RoleGrant> = {
  url: "/role-grants/:id",
  method: "PATCH",
  config: {
    permissionsCheckedByHandler: ["update:role_grants"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateGrant;
