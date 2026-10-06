import { z } from "zod/v4";

import { AUDIT_ENTITIES, AUDIT_OPERATION_KINDS, AUDIT_OPS, AUDIT_SOURCES } from "../audit.ts";
import {
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_TOTAL_NOTE,
  MAX_ID,
  booleanQuerySchema,
  countryCodeSchema,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvIdsSchema,
  csvUuidsSchema,
  cursorSchema,
  idParamSchema,
  idSchema,
  instantSchema,
  limitSchema,
  pagingSchema,
  userRefSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { STATION_SITE_ID_NOTE } from "./stations.ts";

export const AUDIT_OPERATION_SORTS = ["-createdAt", "createdAt"] as const;
export type AuditOperationSort = (typeof AUDIT_OPERATION_SORTS)[number];

export const AUDIT_OPERATION_INCLUDES = ["stations"] as const;
export type AuditOperationInclude = (typeof AUDIT_OPERATION_INCLUDES)[number];

export const AUDIT_REVERT_REASONS = [
  "unsupported_entity",
  "unsupported_op",
  "operation_reverted",
  "already_reverted",
  "missing_record_id",
  "missing_old_values",
  "missing_new_values",
  "missing_details",
  "no_changes",
] as const;
export type AuditRevertReason = (typeof AUDIT_REVERT_REASONS)[number];

export const AUDIT_CONFLICT_KINDS = [
  "missing",
  "stale",
  "already_absent",
  "exists",
  "unique_violation",
  "fk_missing",
  "referenced",
  "station_without_cells",
  "concurrent_modification",
] as const;
export type AuditConflictKind = (typeof AUDIT_CONFLICT_KINDS)[number];

export const MAX_REVERT_ENTRIES = 500;
const AUDIT_SEARCH_MAX_LENGTH = 100;

const auditOffsetSchema = z.coerce
  .number<number>()
  .int()
  .min(0)
  .max(MAX_ID)
  .describe("The number of operations to skip. It can reach any depth, so you can jump straight to the last page. Cannot be combined with `cursor`");

const storedMetadataSchema = z.record(z.string(), z.unknown()).nullable().describe("Returned as stored, without renaming its keys");

const REVERTS_NOTE = "The operation this one reverts, or `null` if this operation is not a revert";
const REVERTED_BY_NOTE = "The operation that reverted this one. `null` if this operation has not been reverted, or only in part";
const RECORD_ID_NOTE =
  "The id of the changed row, a number or a UUID depending on the table. " +
  "`null` for entries that cover a set of rows, such as a station's sectors or photo selection, and for the settings";
const ENTRY_STATION_NOTE = "The station the change belongs to, or `null` if it does not belong to one";
const OPERATION_STATIONS_NOTE =
  "Only returned with `include=stations`, which only the list of operations takes. The stations in `stationIds` as they are now. " +
  "Stations that no longer exist and stations in countries you cannot access are left out, " +
  "and maintainers only get stations in the countries they maintain";

export const auditCountSchema = z.object({
  entity: z.enum(AUDIT_ENTITIES),
  action: z.enum(AUDIT_OPS),
  count: z.number().int().nonnegative(),
});

export const auditOperationStationSchema = z.object({
  id: idSchema,
  siteId: z.string().describe(STATION_SITE_ID_NOTE),
  operatorId: idSchema.nullable(),
});
export type AuditOperationStation = z.infer<typeof auditOperationStationSchema>;

export const auditOperationSchema = z.object({
  id: idSchema,
  kind: z
    .enum(AUDIT_OPERATION_KINDS)
    .describe("What the operation did, for example `submission.approve`. `revert` marks an operation that reverts another one"),
  source: z.enum(AUDIT_SOURCES).describe("`api`: a person, through the site or the API. `import`: an automatic import. `system`: a server job"),
  clientKey: z.uuid().nullable().describe("Set when the client grouped several requests into this one operation"),
  actor: userRefSchema.nullable().describe("The user the change is attributed to, for example the submitter of an approved submission"),
  performer: userRefSchema.nullable().describe("The user who sent the request, for example the reviewer who approved the submission"),
  ipAddress: z.string().nullable().describe("`null` if you are a country maintainer"),
  userAgent: z.string().nullable().describe("`null` if you are a country maintainer"),
  metadata: storedMetadataSchema,
  revertsOperationId: idSchema.nullable().describe(REVERTS_NOTE),
  revertedByOperationId: idSchema.nullable().describe(REVERTED_BY_NOTE),
  countryCode: countryCodeSchema.nullable().describe("Set when all changes in the operation belong to the same country"),
  entryCount: z.number().int().nonnegative().describe("The number of entries the operation recorded"),
  counts: z.array(auditCountSchema).describe("The entries counted per table and action"),
  stationIds: z.array(idSchema).describe("The stations the operation's entries belong to"),
  stations: z.array(auditOperationStationSchema).optional().describe(OPERATION_STATIONS_NOTE),
  createdAt: z.iso.datetime(),
});
export type AuditOperation = z.infer<typeof auditOperationSchema>;

export const auditEntrySchema = z.object({
  id: idSchema,
  entity: z.enum(AUDIT_ENTITIES).describe("The name of the database table that holds the row"),
  action: z.enum(AUDIT_OPS),
  recordId: z.string().nullable().describe(RECORD_ID_NOTE),
  stationId: idSchema.nullable().describe(ENTRY_STATION_NOTE),
  oldValues: z.unknown().nullable().describe("The row before the change, as stored. Its keys are database column names"),
  newValues: z.unknown().nullable().describe("The row after the change, as stored. Its keys are database column names"),
  metadata: storedMetadataSchema,
  isRevertible: z.boolean().describe("Whether the entry can still be reverted"),
  revertReason: z.enum(AUDIT_REVERT_REASONS).nullable().describe("Why the entry cannot be reverted, or `null` if it can"),
  createdAt: z.iso.datetime(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditOperationLinkSchema = z.object({
  id: idSchema,
  kind: z.enum(AUDIT_OPERATION_KINDS),
  createdAt: z.iso.datetime(),
});
export type AuditOperationLink = z.infer<typeof auditOperationLinkSchema>;

export const auditOperationDetailSchema = auditOperationSchema.extend({
  entries: z.array(auditEntrySchema),
  isRevertible: z.boolean().describe("Whether at least one entry can still be reverted"),
  revertsOperation: auditOperationLinkSchema.nullable().describe(REVERTS_NOTE),
  revertedByOperation: auditOperationLinkSchema.nullable().describe(REVERTED_BY_NOTE),
});
export type AuditOperationDetail = z.infer<typeof auditOperationDetailSchema>;

export const auditOperationParamsSchema = z.object({ id: idParamSchema });

export const auditOperationListQuerySchema = z
  .object({
    kinds: csvEnumSchema(AUDIT_OPERATION_KINDS).optional(),
    entities: csvEnumSchema(AUDIT_ENTITIES)
      .optional()
      .describe(`Only operations with an entry for one of these tables. Comma-separated list. Possible values: \`${AUDIT_ENTITIES.join("`, `")}\``),
    actions: csvEnumSchema(AUDIT_OPS)
      .optional()
      .describe(`Only operations with an entry of one of these actions. Comma-separated list. Possible values: \`${AUDIT_OPS.join("`, `")}\``),
    userIds: csvUuidsSchema.optional().describe("Comma-separated user UUIDs. Matches operations whose actor or performer is one of these users"),
    stationIds: csvIdsSchema.optional().describe("Only operations with an entry that belongs to one of these stations. Comma-separated ids"),
    countryCodes: csvCountryCodesSchema
      .optional()
      .describe("Only operations whose `countryCode` is one of these. Comma-separated two-letter country codes"),
    createdAfter: instantSchema.optional().describe("Only operations created at or after this time"),
    createdBefore: instantSchema.optional().describe("Only operations created at or before this time"),
    q: z
      .string()
      .trim()
      .min(1)
      .max(AUDIT_SEARCH_MAX_LENGTH)
      .refine((value) => !value.includes("\u0000"), { message: "Must not contain a null character" })
      .optional()
      .describe("A number matches a record id or a station id. Any other text matches a record id or text in an entry's metadata"),
    sort: z
      .enum(AUDIT_OPERATION_SORTS)
      .default("-createdAt")
      .describe("The field to sort by, with a leading `-` for descending order. A `cursor` only works with the `sort` it was returned for"),
    include: csvEnumSchema(AUDIT_OPERATION_INCLUDES).optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: auditOffsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type AuditOperationListQuery = z.infer<typeof auditOperationListQuerySchema>;

export const auditOperationListSchema = z.object({
  data: z.array(auditOperationSchema),
  paging: pagingSchema,
});
export type AuditOperationList = z.infer<typeof auditOperationListSchema>;

export const auditRevertSchema = z
  .object({
    entryIds: z
      .array(idSchema)
      .min(1)
      .max(MAX_REVERT_ENTRIES)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Entry ids must be unique" })
      .optional()
      .describe("The entries to revert. If omitted, the whole operation is reverted"),
    force: z
      .boolean()
      .optional()
      .describe(
        "Reverts even if the data has changed since the operation, instead of responding with 409. Newer values are overwritten, " +
          "entries that can no longer be applied are skipped, and references to records that are gone are left empty",
      ),
  })
  .strict();
export type AuditRevert = z.infer<typeof auditRevertSchema>;

export const auditRevertSkippedSchema = z.object({
  entryId: idSchema,
  reason: z.enum([...AUDIT_REVERT_REASONS, ...AUDIT_CONFLICT_KINDS]).describe("Why the entry was not reverted"),
  message: z.string().nullable(),
});

export const auditRevertSkippedFieldSchema = z.object({
  entryId: idSchema,
  field: z.string().describe("A database column that was left empty because the record it referenced no longer exists"),
  reason: z.literal("fk_missing"),
});

export const auditRevertResultSchema = z.object({
  operation: auditOperationSchema.describe("The new operation that records the revert"),
  revertedEntryIds: z.array(idSchema).describe("The entries that were reverted"),
  skipped: z.array(auditRevertSkippedSchema).describe("The entries that were not reverted, each with the reason"),
  skippedFields: z
    .array(auditRevertSkippedFieldSchema)
    .describe("The references that a forced revert left empty because the record they pointed to no longer exists"),
  affectedStationIds: z.array(idSchema).describe("The stations whose data the revert changed"),
});
export type AuditRevertResult = z.infer<typeof auditRevertResultSchema>;

export const auditRevertConflictSchema = z.object({
  entryId: idSchema,
  entity: z.enum(AUDIT_ENTITIES).describe("The name of the database table that holds the row"),
  action: z.enum(AUDIT_OPS),
  recordId: z.string().nullable().describe(RECORD_ID_NOTE),
  stationId: idSchema.nullable().describe(ENTRY_STATION_NOTE),
  kind: z
    .enum(AUDIT_CONFLICT_KINDS)
    .describe(
      "The kind of conflict. `stale`: the record has changed since the operation. `missing`: the record no longer exists. " +
        "`exists`: a record with the same id already exists. `fk_missing`: a record it refers to no longer exists. " +
        "`referenced`: other records still refer to what the revert would remove",
    ),
  message: z.string(),
  fields: z
    .array(z.object({ field: z.string(), expected: z.unknown(), current: z.unknown() }))
    .optional()
    .describe("For `stale`: the columns whose current value differs from the value the operation left"),
  dependents: z
    .array(z.object({ table: z.string(), count: z.number().int().nonnegative() }))
    .optional()
    .describe("For `referenced`: what still refers to the record, with the number of rows"),
  constraint: z.string().optional().describe("The name of the database constraint involved, if one is known"),
});
export type AuditRevertConflict = z.infer<typeof auditRevertConflictSchema>;
