import { z } from "zod/v4";

import { AT_LEAST_ONE_FIELD_ISSUE, countryCodeSchema, csvCountryCodesSchema, csvEnumSchema, hasAnyField, idParamSchema, idSchema } from "./common.ts";
import { LTE_SEQUENCE_DIGITS, STATION_IDENTIFIER_KINDS } from "./constants.ts";

export const PLMN_ROLES = ["primary", "secondary"] as const;
export type PlmnRole = (typeof PLMN_ROLES)[number];

export const OPERATOR_LINK_KINDS = ["jvMember"] as const;
export type OperatorLinkKind = (typeof OPERATOR_LINK_KINDS)[number];

export const OPERATOR_INCLUDES = ["conventions"] as const;

const operatorNameSchema = z.string().trim().min(1).max(100);
const operatorLegalNameSchema = z.string().trim().min(1).max(250);
const operatorShortCodeSchema = z.string().trim().min(1).max(16);
const operatorSortPrioritySchema = z.number().int().min(1).max(1000);
const plmnCodeSchema = z.string().regex(/^[1-9]\d{4,5}$/, "Must be a three-digit MCC followed by a two- or three-digit MNC");

const PLMN_ROLE_NOTE = "At most one code is `primary`, and it is also returned as `primaryPlmn`";
const LINK_KIND_NOTE = "`jvMember` makes the operator a member of the shared network in `operatorId`";
const BRAND_NOTE = "The brand whose logo and color represent the operator";
const OPERATOR_NAME_NOTE = "Must be unique within the country";
const LEGAL_NAME_NOTE = "The registered name of the company behind the operator";
const SHORT_CODE_NOTE = "A short label for the operator, for places where the name does not fit";
const SORT_PRIORITY_NOTE = "Position among the country's main operators, lowest first. `null` for all other operators";

export const plmnSchema = z.object({
  mcc: z.string().describe("Mobile country code, three digits"),
  mnc: z.string().describe("Mobile network code, two or three digits"),
  plmn: z.string().describe("The full network code: `mcc` followed by `mnc`"),
  role: z.enum(PLMN_ROLES).describe(PLMN_ROLE_NOTE),
});
export type Plmn = z.infer<typeof plmnSchema>;

export const operatorLinkSchema = z.object({
  kind: z.enum(OPERATOR_LINK_KINDS).describe(LINK_KIND_NOTE),
  operatorId: z.number().int().describe("The shared network, which is an operator itself"),
});
export type OperatorLink = z.infer<typeof operatorLinkSchema>;

export const lteSectorRuleSchema = z.object({
  clidStep: z.number().int().describe("How much the CLID grows from one sector's cell to the next"),
  sequenceStart: z
    .object({
      eciDigit: z.enum(LTE_SEQUENCE_DIGITS).describe("Which decimal digit of the cell's `eci` is checked, not of its `clid`"),
      values: z.array(z.number().int()).describe("The digit values that start a sequence"),
    })
    .describe("A cell can be the first of a sequence when that digit of its `eci` is one of `values`"),
  maxSectors: z.number().int().describe("The most sectors a sequence can have. A band's sequence has three unless its cells fill a longer one"),
});
export type LteSectorRule = z.infer<typeof lteSectorRuleSchema>;

export const defaultEarfcnSchema = z.object({
  bandCode: z.string().describe("The band's `code` in `GET /bands`"),
  earfcn: z.number().int(),
});

export const operatorConventionsSchema = z.object({
  gnbidLength: z.number().int().describe("The gNBID length in bits of the operator's NR cells. New cells get it when you leave `gnbidLength` out"),
  identifierKinds: z
    .array(z.enum(STATION_IDENTIFIER_KINDS))
    .describe("The kinds of `identifiers` the operator's stations can have. Direct station changes with other kinds are refused"),
  lteSectorRule: lteSectorRuleSchema
    .nullable()
    .describe("How the operator numbers a station's LTE cells in one band, one cell per sector. `null` if the operator has no fixed pattern"),
  defaultEarfcns: z.array(defaultEarfcnSchema).describe("The channel to suggest for a new LTE cell of the operator, per band"),
});
export type OperatorConventions = z.infer<typeof operatorConventionsSchema>;

export const operatorSchema = z.object({
  id: z.number().int(),
  countryCode: countryCodeSchema,
  brandId: z.number().int().nullable().describe(BRAND_NOTE),
  name: z.string(),
  legalName: z.string().describe(LEGAL_NAME_NOTE),
  shortCode: z.string().nullable().describe(SHORT_CODE_NOTE),
  sortPriority: z.number().int().nullable().describe(SORT_PRIORITY_NOTE),
  primaryPlmn: z.string().nullable().describe("The `plmn` of the entry in `plmns` whose `role` is `primary`. To change it, send `plmns`"),
  plmns: z.array(plmnSchema).describe("The operator's network codes"),
  links: z.array(operatorLinkSchema).describe("The shared networks this operator is a member of"),
});
export type Operator = z.infer<typeof operatorSchema>;

export const operatorWithConventionsSchema = operatorSchema.extend({
  conventions: operatorConventionsSchema
    .optional()
    .describe("Only returned with `include=conventions`. How the operator numbers its cells and names its stations"),
});
export type OperatorWithConventions = z.infer<typeof operatorWithConventionsSchema>;

export const operatorParamsSchema = z.object({ id: idParamSchema });

export const operatorQuerySchema = z.object({ include: csvEnumSchema(OPERATOR_INCLUDES).optional() }).strict();
export type OperatorQuery = z.infer<typeof operatorQuerySchema>;

export const operatorListQuerySchema = z
  .object({ countryCodes: csvCountryCodesSchema.optional(), include: csvEnumSchema(OPERATOR_INCLUDES).optional() })
  .strict();
export type OperatorListQuery = z.infer<typeof operatorListQuerySchema>;

const plmnsInputSchema = z
  .array(
    z
      .object({
        plmn: plmnCodeSchema.describe(
          "A three-digit MCC followed by a two- or three-digit MNC, for example `310260`. A code can belong to only one operator",
        ),
        role: z.enum(PLMN_ROLES).describe(PLMN_ROLE_NOTE),
      })
      .strict(),
  )
  .max(50)
  .refine((plmns) => new Set(plmns.map((entry) => entry.plmn)).size === plmns.length, { message: "Each PLMN can appear once" })
  .refine((plmns) => plmns.filter((entry) => entry.role === "primary").length <= 1, { message: "Only one PLMN can be primary" })
  .describe("The complete list of the operator's network codes. It replaces the stored list");
export type PlmnInput = z.infer<typeof plmnsInputSchema>[number];

const linksInputSchema = z
  .array(
    z
      .object({
        kind: z.enum(OPERATOR_LINK_KINDS).describe(LINK_KIND_NOTE),
        operatorId: idSchema.describe("The shared network, which must be another operator in the same country"),
      })
      .strict(),
  )
  .max(50)
  .refine((links) => new Set(links.map((link) => `${link.kind}:${link.operatorId}`)).size === links.length, {
    message: "Each link can appear once",
  })
  .describe("The complete list of the operator's links. It replaces the stored list");
export type OperatorLinkInput = z.infer<typeof linksInputSchema>[number];

export const operatorCreateSchema = z
  .object({
    countryCode: countryCodeSchema,
    brandId: idSchema.nullable().optional().describe(BRAND_NOTE),
    name: operatorNameSchema.describe(OPERATOR_NAME_NOTE),
    legalName: operatorLegalNameSchema.describe(LEGAL_NAME_NOTE),
    shortCode: operatorShortCodeSchema.nullable().optional().describe(SHORT_CODE_NOTE),
    sortPriority: operatorSortPrioritySchema.nullable().optional().describe(SORT_PRIORITY_NOTE),
    plmns: plmnsInputSchema.optional(),
    links: linksInputSchema.optional(),
  })
  .strict();
export type OperatorCreate = z.infer<typeof operatorCreateSchema>;

export const operatorUpdateSchema = z
  .object({
    brandId: idSchema.nullable().optional().describe(BRAND_NOTE),
    name: operatorNameSchema.optional().describe(OPERATOR_NAME_NOTE),
    legalName: operatorLegalNameSchema.optional().describe(LEGAL_NAME_NOTE),
    shortCode: operatorShortCodeSchema.nullable().optional().describe(SHORT_CODE_NOTE),
    sortPriority: operatorSortPrioritySchema.nullable().optional().describe(SORT_PRIORITY_NOTE),
    plmns: plmnsInputSchema.optional(),
    links: linksInputSchema.optional(),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type OperatorUpdate = z.infer<typeof operatorUpdateSchema>;
