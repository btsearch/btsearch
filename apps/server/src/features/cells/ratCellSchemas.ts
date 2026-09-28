import { gsmCells, lteCells, nrCells, umtsCells } from "@openbts/drizzle";
import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

export const INSERT_OMIT = { cell_id: true, createdAt: true, updatedAt: true } as const;
export const UPDATE_OMIT = { createdAt: true, updatedAt: true } as const;

export const gsmInsertSchema = createInsertSchema(gsmCells)
  .omit(INSERT_OMIT)
  .extend({ lac: z.number().int().min(0).max(65535), cid: z.number().int().min(0).max(65535) })
  .strict();
export const gsmUpdateSchema = createUpdateSchema(gsmCells)
  .omit(UPDATE_OMIT)
  .extend({ lac: z.number().int().min(0).max(65535).optional(), cid: z.number().int().min(0).max(65535).optional() })
  .strict();

export const umtsNullableFields = {
  lac: z.number().int().min(0).max(65535).nullable().optional(),
  arfcn: z.number().int().min(0).max(16383).nullable().optional(),
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

export const nrExtendFields = {
  nrtac: z.number().int().min(0).max(16777215).nullable().optional(),
  gnbid: z.number().int().min(0).max(4294967295).nullable().optional(),
  clid: z.number().int().min(0).max(16383).nullable().optional(),
  pci: z.number().int().min(0).max(1007).nullable().optional(),
  arfcn: z.number().int().min(0).max(3279165).nullable().optional(),
};
export const nrInsertSchema = createInsertSchema(nrCells).omit(INSERT_OMIT).extend(nrExtendFields).strict();
export const nrUpdateSchema = createUpdateSchema(nrCells).omit(UPDATE_OMIT).extend(nrExtendFields).strict();

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
