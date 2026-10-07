import {
  auditOperationParamsSchema,
  auditRevertConflictSchema,
  auditRevertResultSchema,
  auditRevertSchema,
  auditRevertSkippedSchema,
} from "@openbts/shared/contract";
import type { AuditRevert, AuditRevertResult } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertAuditReach, redactForReach } from "../../../../../features/audit/access.js";
import { standaloneAuditContext } from "../../../../../features/audit/context.js";
import { type RevertOperationResult, revertOperation } from "../../../../../features/audit/revert/index.js";
import { renameRevertErrorDetails, toAuditRevertResult } from "../../../../../features/audit/serialize.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const conflictErrorSchema = z.object({ code: z.literal("CONFLICT"), message: z.string(), details: z.array(auditRevertConflictSchema) });
const duplicateRequestErrorSchema = z.object({ code: z.literal("DUPLICATE_REQUEST"), message: z.string() });
const badRequestErrorSchema = z.object({
  code: z.literal("BAD_REQUEST"),
  message: z.string(),
  details: z.array(auditRevertSkippedSchema.partial({ message: true })).optional(),
});
const validationErrorSchema = z.object({
  code: z.literal("VALIDATION_ERROR"),
  message: z.string(),
  details: z.array(z.object({ field: z.string(), validationMessage: z.string().optional() })),
});
const schemaRoute = {
  summary: "Revert an audit operation",
  description:
    "Reverts the changes an operation made and records the revert as a new operation. " +
    "You need to be an administrator, or a maintainer of the country the operation belongs to. " +
    "Without `force`, nothing is reverted if any of the affected data has changed since the operation.",
  params: auditOperationParamsSchema,
  body: auditRevertSchema,
  response: {
    200: z.object({
      data: auditRevertResultSchema,
    }),
  },
};
const errorBodies = {
  400: z.object({
    errors: z.array(z.discriminatedUnion("code", [badRequestErrorSchema, validationErrorSchema])).min(1),
  }),
  409: z.object({
    errors: z.array(z.discriminatedUnion("code", [conflictErrorSchema, duplicateRequestErrorSchema])).min(1),
  }),
};
const errorReasons = {
  400:
    "The request is invalid, the operation has already been reverted, or none of the selected entries can be reverted. " +
    "In the last case `details` explains why each entry was skipped.",
  403: "You are neither an administrator nor a maintainer, or the operation touches data that is no longer in a country you maintain.",
  404: "The operation does not exist, or it does not belong to a country you maintain.",
  409:
    "The data has changed since the operation, and `details` lists every conflict. " +
    "Send `force` to revert anyway: newer values are overwritten, entries that can no longer be applied are skipped, " +
    "and references to records that are gone are left empty. " +
    "A revert can still fail with 409 when the data changes while it is being applied.",
};
type RequestData = { Params: z.infer<typeof auditOperationParamsSchema>; Body: AuditRevert };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<AuditRevertResult>>) {
  const reach = await assertAuditReach(req, "revert");
  const input = {
    operationId: req.params.id,
    entryIds: req.body.entryIds,
    force: req.body.force ?? false,
    ctx: standaloneAuditContext(req),
    countryCodes: reach.isEverywhere ? undefined : reach.countryCodes,
  };

  let result: RevertOperationResult;
  try {
    result = await revertOperation(input);
  } catch (error) {
    renameRevertErrorDetails(error);
    throw error;
  }

  return res.send({ data: toAuditRevertResult({ ...result, operation: redactForReach(reach, result.operation) }) });
}

const revertAuditOperation: Route<RequestData, AuditRevertResult> = {
  url: "/audit-operations/:id/revert",
  method: "POST",
  config: {
    permissionsCheckedByHandler: ["revert:audit_operations"],
    retainIdempotencyKey: true,
    errorBodies,
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default revertAuditOperation;
