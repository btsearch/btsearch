import { auditOperationDetailSchema, auditOperationParamsSchema } from "@openbts/shared/contract";
import type { AuditOperationDetail } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { assertAuditReach, isWithinReach, redactForReach } from "../../../../features/audit/access.js";
import { fetchAuditOperation } from "../../../../features/audit/read.js";
import { toAuditOperationDetail } from "../../../../features/audit/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an audit operation",
  description:
    "Returns one audit operation with all of its entries. " +
    "Each entry has the row before and after the change and says whether it can still be reverted. " +
    "You need to be an administrator, or a maintainer of the country the operation belongs to. " +
    "Operations without a `countryCode` can only be read by administrators.",
  params: auditOperationParamsSchema,
  response: {
    200: z.object({
      data: auditOperationDetailSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof auditOperationParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<AuditOperationDetail>>) {
  const reach = await assertAuditReach(req, "read");
  const operation = await fetchAuditOperation(req.params.id);
  if (operation === null || !isWithinReach(reach, operation.country_code)) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: toAuditOperationDetail(redactForReach(reach, operation)) });
}

const getAuditOperation: Route<ReqParams, AuditOperationDetail> = {
  url: "/audit-operations/:id",
  method: "GET",
  config: {
    permissionsCheckedByHandler: ["read:audit_operations"],
    errorReasons: {
      403: "You are neither an administrator nor a maintainer.",
      404: "The operation does not exist, or it does not belong to a country you maintain.",
    },
  },
  schema: schemaRoute,
  handler,
};

export default getAuditOperation;
