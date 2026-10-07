import { gsmCells, lteCells, nrCells, umtsCells } from "@openbts/drizzle";
import { BSIC_MAX, GNBID_MAX_LENGTH, GNBID_MIN_LENGTH, PSC_MAX } from "@openbts/shared/contract";
import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

import { ErrorResponse, ValidationError } from "../../errors.js";
import { toFieldPath } from "../../lib/fieldPath.js";

export const INSERT_OMIT = { cell_id: true, createdAt: true, updatedAt: true } as const;
export const UPDATE_OMIT = { cell_id: true, createdAt: true, updatedAt: true } as const;

export const gsmNullableFields = {
  bsic: z.number().int().min(0).max(BSIC_MAX).nullable().optional(),
};
export const gsmInsertSchema = createInsertSchema(gsmCells)
  .omit(INSERT_OMIT)
  .extend({ ...gsmNullableFields, lac: z.number().int().min(0).max(65535), cid: z.number().int().min(0).max(65535) })
  .strict();
export const gsmUpdateSchema = createUpdateSchema(gsmCells)
  .omit(UPDATE_OMIT)
  .extend({ ...gsmNullableFields, lac: z.number().int().min(0).max(65535).optional(), cid: z.number().int().min(0).max(65535).optional() })
  .strict();

export const umtsNullableFields = {
  lac: z.number().int().min(0).max(65535).nullable().optional(),
  arfcn: z.number().int().min(0).max(16383).nullable().optional(),
  psc: z.number().int().min(0).max(PSC_MAX).nullable().optional(),
};
export const umtsInsertSchema = createInsertSchema(umtsCells)
  .omit(INSERT_OMIT)
  .extend({ ...umtsNullableFields, rnc: z.number().int().min(0).max(65535), cid: z.number().int().min(0).max(65535) })
  .strict();
export const umtsUpdateSchema = createUpdateSchema(umtsCells)
  .omit(UPDATE_OMIT)
  .extend({ ...umtsNullableFields, rnc: z.number().int().min(0).max(65535).optional(), cid: z.number().int().min(0).max(65535).optional() })
  .strict();

export const lteNullableFields = {
  pci: z.number().int().min(0).max(503).nullable().optional(),
  earfcn: z.number().int().min(0).max(262143).nullable().optional(),
};
export const lteInsertSchema = createInsertSchema(lteCells)
  .omit(INSERT_OMIT)
  .extend({
    tac: z.number().int().min(0).max(65535),
    enbid: z.number().int().min(0).max(1048575),
    clid: z.number().int().min(0).max(255),
    ...lteNullableFields,
  })
  .strict();
export const lteUpdateSchema = createUpdateSchema(lteCells)
  .omit(UPDATE_OMIT)
  .extend({
    tac: z.number().int().min(0).max(65535).nullable().optional(),
    enbid: z.number().int().min(0).max(1048575).optional(),
    clid: z.number().int().min(0).max(255).optional(),
    ...lteNullableFields,
  })
  .strict();

export const gnbidLengthSchema = z.number().int().min(GNBID_MIN_LENGTH).max(GNBID_MAX_LENGTH).optional();

export const nrExtendFields = {
  nrtac: z.number().int().min(0).max(16777215).nullable().optional(),
  gnbid: z.number().int().min(0).max(2147483647).nullable().optional(),
  gnbid_length: gnbidLengthSchema,
  clid: z.number().int().min(0).max(16383).nullable().optional(),
  pci: z.number().int().min(0).max(1007).nullable().optional(),
  arfcn: z.number().int().min(0).max(3279165).nullable().optional(),
};
export const nrInsertSchema = createInsertSchema(nrCells).omit(INSERT_OMIT).extend(nrExtendFields).strict().superRefine(refuseNsaFields);
export const nrUpdateSchema = createUpdateSchema(nrCells).omit(UPDATE_OMIT).extend(nrExtendFields).strict();

const NSA_FIELD_MESSAGES = {
  nrtac: "A TAC must not be set for an NR NSA cell",
  clid: "A CLID must not be set for an NR NSA cell",
  gnbid: "A gNB ID must not be set for an NR NSA cell",
  supports_nr_redcap: "RedCap support must not be set for an NR NSA cell",
} as const;

const CLEARED_NSA_FIELDS = { nrtac: null, clid: null, gnbid: null, supports_nr_redcap: false } as const;

type NsaField = keyof typeof NSA_FIELD_MESSAGES;
type NsaFieldValues = Partial<Record<NsaField, unknown>>;

function nsaFieldsInUse(details: NsaFieldValues): NsaField[] {
  const fieldsInUse: NsaField[] = [];
  for (const field of ["nrtac", "clid", "gnbid"] as const) {
    if (details[field] !== null && details[field] !== undefined) fieldsInUse.push(field);
  }
  if (details.supports_nr_redcap === true) fieldsInUse.push("supports_nr_redcap");
  return fieldsInUse;
}

export function refuseNsaFields(details: NsaFieldValues & { type?: string }, ctx: z.RefinementCtx): void {
  if (details.type !== "nsa") return;
  for (const field of nsaFieldsInUse(details)) ctx.addIssue({ code: "custom", message: NSA_FIELD_MESSAGES[field], path: [field] });
}

export function assertNsaFieldsUnset(details: z.infer<typeof nrUpdateSchema>, storedType: string | null | undefined): void {
  if ((details.type ?? storedType) !== "nsa") return;

  const [fieldInUse] = nsaFieldsInUse(details);
  if (fieldInUse !== undefined) throw new ErrorResponse("BAD_REQUEST", { message: NSA_FIELD_MESSAGES[fieldInUse] });
}

export const normalRatInsertSchemaMap = {
  GSM: gsmInsertSchema,
  UMTS: umtsInsertSchema,
  LTE: lteInsertSchema,
  NR: nrInsertSchema,
} as const;

export const normalRatUpdateSchemaMap = {
  GSM: gsmUpdateSchema,
  UMTS: umtsUpdateSchema,
  LTE: lteUpdateSchema,
  NR: nrUpdateSchema,
} as const;

export function assertRatUpdateDetails(
  rat: keyof typeof normalRatUpdateSchemaMap,
  details: unknown,
  path: readonly PropertyKey[] = ["details"],
): void {
  const schema: z.ZodType = normalRatUpdateSchemaMap[rat];
  const parsed = schema.safeParse(details);
  if (parsed.success) return;

  throw new ValidationError(parsed.error.issues.map((issue) => ({ field: toFieldPath([...path, ...issue.path]), validationMessage: issue.message })));
}

function hasUpdateSchema(rat: string): rat is keyof typeof normalRatUpdateSchemaMap {
  return Object.hasOwn(normalRatUpdateSchemaMap, rat);
}

export function assertCellUpdateFitsStoredRat(
  stored: { id: number; rat: string },
  update: { rat?: string; details?: unknown },
  detailsPath?: readonly PropertyKey[],
): void {
  if (update.rat !== undefined && update.rat !== stored.rat) {
    throw new ErrorResponse("BAD_REQUEST", { message: `A cell's technology cannot be changed; cell ${stored.id} is ${stored.rat}` });
  }
  if (update.details && hasUpdateSchema(stored.rat)) assertRatUpdateDetails(stored.rat, update.details, detailsPath);
}

export function assertCellUpdateSetsNoNsaFields(stored: { rat: string; nr: { type: string } | null }, update: { details?: unknown }): void {
  if (update.details && stored.rat === "NR") assertNsaFieldsUnset(update.details as z.infer<typeof nrUpdateSchema>, stored.nr?.type);
}

export function withNsaFieldsCleared<Details extends object>(stored: { rat: string }, details: Details): Details {
  const becomesNsa = stored.rat === "NR" && "type" in details && details.type === "nsa";
  return becomesNsa ? { ...details, ...CLEARED_NSA_FIELDS } : details;
}
