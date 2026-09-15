import { AUDIT_ENTITIES, AUDIT_OPS } from "@openbts/shared/audit";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { auditContextFromRequest } from "../../../../../services/audit/context.js";
import { type RevertOperationResult, revertOperation } from "../../../../../services/audit/revert/index.js";
import { auditOperationSummarySchema } from "../../../../../services/audit/schemas.js";

const paramsSchema = z.object({ id: z.coerce.number().int().positive() }).strict();
const bodySchema = z
  .object({
    entry_ids: z
      .array(z.number().int().positive())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, "entry_ids must be unique")
      .optional(),
    force: z.boolean().optional(),
  })
  .strict();
const skippedSchema = z.object({ entry_id: z.number(), reason: z.string(), message: z.string().optional() });
const skippedFieldSchema = z.object({ entry_id: z.number(), field: z.string(), reason: z.literal("fk_missing") });
const conflictSchema = z.object({
  entry_id: z.number(),
  entity: z.enum(AUDIT_ENTITIES),
  op: z.enum(AUDIT_OPS),
  record_id: z.string().nullable(),
  station_id: z.number().nullable(),
  kind: z.enum([
    "missing",
    "stale",
    "already_absent",
    "exists",
    "unique_violation",
    "fk_missing",
    "referenced",
    "station_without_cells",
    "concurrent_modification",
  ]),
  message: z.string(),
  fields: z.array(z.object({ field: z.string(), expected: z.unknown(), current: z.unknown() })).optional(),
  dependents: z.array(z.object({ table: z.string(), count: z.number() })).optional(),
  constraint: z.string().optional(),
});
const conflictErrorSchema = z.object({ code: z.literal("CONFLICT"), message: z.string(), details: z.array(conflictSchema) });
const duplicateRequestErrorSchema = z.object({ code: z.literal("DUPLICATE_REQUEST"), message: z.string() });
const badRequestErrorSchema = z.object({ code: z.literal("BAD_REQUEST"), message: z.string(), details: z.array(skippedSchema).optional() });
const validationErrorSchema = z.object({
  code: z.literal("VALIDATION_ERROR"),
  message: z.string(),
  details: z.array(z.object({ field: z.string(), validationMessage: z.string().optional() })),
});
const schemaRoute = {
  params: paramsSchema,
  body: bodySchema,
  response: {
    400: z.object({
      errors: z.array(z.discriminatedUnion("code", [badRequestErrorSchema, validationErrorSchema])).min(1),
    }),
    200: z.object({
      data: z.object({
        operation: auditOperationSummarySchema,
        reverted: z.array(z.number()),
        skipped: z.array(skippedSchema),
        skipped_fields: z.array(skippedFieldSchema),
        affected_station_ids: z.array(z.number()),
      }),
    }),
    409: z.object({
      errors: z.array(z.discriminatedUnion("code", [conflictErrorSchema, duplicateRequestErrorSchema])).min(1),
    }),
  },
};

type RequestData = { Params: z.infer<typeof paramsSchema>; Body: z.infer<typeof bodySchema> };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<RevertOperationResult>>) {
  const result = await revertOperation({
    operationId: req.params.id,
    entryIds: req.body.entry_ids,
    force: req.body.force ?? false,
    ctx: auditContextFromRequest(req),
  });
  return res.send({ data: result });
}

const revertAuditOperation: Route<RequestData, RevertOperationResult> = {
  url: "/audit-operations/:id/revert",
  method: "POST",
  config: {
    permissions: ["revert:audit_operations"],
    retainIdempotencyKey: true,
  },
  schema: schemaRoute,
  handler,
};

export default revertAuditOperation;
