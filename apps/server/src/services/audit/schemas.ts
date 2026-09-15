import { AUDIT_ENTITIES, AUDIT_OPERATION_KINDS, AUDIT_OPS, AUDIT_SOURCES } from "@openbts/shared/audit";
import { z } from "zod/v4";

const auditUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  image: z.string().nullable(),
});

const auditCountSchema = z.object({
  entity: z.enum(AUDIT_ENTITIES),
  op: z.enum(AUDIT_OPS),
  count: z.number(),
});

export const auditOperationSummarySchema = z.object({
  id: z.number(),
  kind: z.enum(AUDIT_OPERATION_KINDS),
  source: z.enum(AUDIT_SOURCES),
  client_key: z.uuid().nullable(),
  createdAt: z.date(),
  actor: auditUserSchema.nullable(),
  performer: auditUserSchema.nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  reverts_operation_id: z.number().nullable(),
  reverted_by_operation_id: z.number().nullable(),
  entry_count: z.number(),
  counts: z.array(auditCountSchema),
  station_ids: z.array(z.number()),
});

const auditEntrySchema = z.object({
  id: z.number(),
  entity: z.enum(AUDIT_ENTITIES),
  op: z.enum(AUDIT_OPS),
  record_id: z.string().nullable(),
  station_id: z.number().nullable(),
  old_values: z.unknown().nullable(),
  new_values: z.unknown().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
  revertible: z.boolean(),
  revert_reason: z.string().optional(),
});

const operationLinkSchema = z.object({ id: z.number(), kind: z.enum(AUDIT_OPERATION_KINDS), createdAt: z.date() });

export const auditOperationDetailSchema = auditOperationSummarySchema.extend({
  entries: z.array(auditEntrySchema),
  revertible: z.boolean(),
  reverts: operationLinkSchema.nullable(),
  reverted_by: operationLinkSchema.nullable(),
});
