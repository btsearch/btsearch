import { z } from "zod/v4";

import { bandSchema } from "./bands.ts";
import {
  AT_LEAST_ONE_FIELD_ISSUE,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvIdsSchema,
  daySchema,
  hasAnyField,
  idParamSchema,
  idSchema,
} from "./common.ts";
import { operatorSchema } from "./operators.ts";

const MAX_KHZ = 100_000_000;
const RANGE_ORDER_MESSAGE = "The low end must be below the high end";
const VALIDITY_ORDER_MESSAGE = "validFrom must not be after validTo";

const khzRangeSchema = z.tuple([z.number().int(), z.number().int()]);
const khzRangeInputSchema = z
  .tuple([z.number().int().positive().max(MAX_KHZ), z.number().int().positive().max(MAX_KHZ)])
  .refine(([low, high]) => low < high, RANGE_ORDER_MESSAGE);

const DOWNLINK_NOTE = "For a `tdd` or `sdl` band, the whole block";
const UPLINK_NOTE = "`null` in a `tdd` or `sdl` band, even though a band's own `uplinkKhz` repeats the range for `tdd`";
const NATIONWIDE_NOTE = "`null` for a nationwide licence";
const SOURCE_NOTE = "Usually the address of the regulator's page or decision, but it can be plain text";
const JOINT_OPERATOR_NOTE =
  "The second holder of a licence two operators hold jointly. When the licence is part of a sale, `operatorId` is the buyer and this is the seller";

export const SPECTRUM_HOLDING_INCLUDES = ["operator", "band"] as const;
export type SpectrumHoldingInclude = (typeof SPECTRUM_HOLDING_INCLUDES)[number];

export const spectrumHoldingSchema = z.object({
  id: z.number().int(),
  operatorId: z.number().int(),
  jointOperatorId: z.number().int().nullable().describe(JOINT_OPERATOR_NOTE),
  bandId: z.number().int(),
  regionId: z.number().int().nullable().describe(NATIONWIDE_NOTE),
  downlinkKhz: khzRangeSchema.describe(DOWNLINK_NOTE),
  uplinkKhz: khzRangeSchema.nullable().describe(UPLINK_NOTE),
  validFrom: daySchema.nullable(),
  validTo: daySchema.nullable().describe("The last day of the licence"),
  source: z.string().nullable().describe(SOURCE_NOTE),
  operator: operatorSchema.optional().describe("Only returned with `include=operator`"),
  jointOperator: operatorSchema.nullable().optional().describe("Only returned with `include=operator`"),
  band: bandSchema.optional().describe("Only returned with `include=band`"),
});
export type SpectrumHolding = z.infer<typeof spectrumHoldingSchema>;

export const spectrumHoldingParamsSchema = z.object({ id: idParamSchema });

const includeSchema = csvEnumSchema(SPECTRUM_HOLDING_INCLUDES).optional();

export const spectrumHoldingQuerySchema = z.object({ include: includeSchema }).strict();
export type SpectrumHoldingQuery = z.infer<typeof spectrumHoldingQuerySchema>;

export const spectrumHoldingListQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema
      .optional()
      .describe("Returns only the holdings of operators in these countries. Comma-separated two-letter country codes"),
    operatorIds: csvIdsSchema
      .optional()
      .describe(
        "Returns the holdings these operators hold, alone or jointly. A jointly held block can come back with another operator in `operatorId`, so group by `jointOperatorId` too",
      ),
    bandIds: csvIdsSchema.optional(),
    activeOn: daySchema.optional().describe("Returns only the holdings whose licence is valid on this day"),
    include: includeSchema,
  })
  .strict();
export type SpectrumHoldingListQuery = z.infer<typeof spectrumHoldingListQuerySchema>;

function isValidityOrdered(validity: { validFrom?: string | null; validTo?: string | null }): boolean {
  const validFrom = validity.validFrom ?? null;
  const validTo = validity.validTo ?? null;
  return validFrom === null || validTo === null || validFrom <= validTo;
}

const spectrumHoldingFieldsSchema = z.object({
  operatorId: idSchema.describe("Can only change to another operator in the same country"),
  jointOperatorId: idSchema.nullable().optional().describe(`Another operator in the same country. ${JOINT_OPERATOR_NOTE}`),
  bandId: idSchema.describe("Must be in the band plan of the operator's country, and its 3GPP ranges must contain the holding's ranges"),
  regionId: idSchema.nullable().optional().describe(`A region of the operator's country. ${NATIONWIDE_NOTE}`),
  downlinkKhz: khzRangeInputSchema.describe(DOWNLINK_NOTE),
  uplinkKhz: khzRangeInputSchema.nullable().optional().describe(UPLINK_NOTE),
  validFrom: daySchema.nullable().optional(),
  validTo: daySchema.nullable().optional(),
  source: z.string().trim().min(1).max(500).nullable().optional().describe(SOURCE_NOTE),
});

export const spectrumHoldingCreateSchema = spectrumHoldingFieldsSchema
  .strict()
  .refine(isValidityOrdered, { path: ["validTo"], message: VALIDITY_ORDER_MESSAGE });
export type SpectrumHoldingCreate = z.infer<typeof spectrumHoldingCreateSchema>;

export const spectrumHoldingUpdateSchema = spectrumHoldingFieldsSchema
  .partial()
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
  .refine(isValidityOrdered, { path: ["validTo"], message: VALIDITY_ORDER_MESSAGE });
export type SpectrumHoldingUpdate = z.infer<typeof spectrumHoldingUpdateSchema>;
