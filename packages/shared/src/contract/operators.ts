import { z } from "zod/v4";

import { AT_LEAST_ONE_FIELD_ISSUE, countryCodeSchema, csvCountryCodesSchema, hasAnyField, idParamSchema, idSchema } from "./common.ts";

export const PLMN_ROLES = ["primary", "secondary"] as const;
export type PlmnRole = (typeof PLMN_ROLES)[number];

export const OPERATOR_LINK_KINDS = ["jvMember"] as const;
export type OperatorLinkKind = (typeof OPERATOR_LINK_KINDS)[number];

const operatorNameSchema = z.string().trim().min(1).max(100);
const operatorLegalNameSchema = z.string().trim().min(1).max(250);
const operatorShortCodeSchema = z.string().trim().min(1).max(16);
const operatorSortPrioritySchema = z.number().int().min(1).max(1000);
const plmnCodeSchema = z.string().regex(/^[1-9]\d{4,5}$/, "Must be a three-digit MCC followed by a two- or three-digit MNC");

const PLMN_ROLE_NOTE =
  "The code's role for the operator. At most one code is `primary`, and it is also returned as `primaryPlmn`. Every other code is `secondary`";
const LINK_KIND_NOTE = "The kind of link. `jvMember` makes the operator a member of the shared network in `operatorId`";
const BRAND_NOTE = "The brand whose logo and color represent the operator";
const OPERATOR_NAME_NOTE = "The operator's name. Must be unique within the country";
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

export const operatorSchema = z.object({
  id: z.number().int(),
  countryCode: countryCodeSchema,
  brandId: z.number().int().nullable().describe(`${BRAND_NOTE}, or \`null\` if the operator has none`),
  name: z.string(),
  legalName: z.string().describe(LEGAL_NAME_NOTE),
  shortCode: z.string().nullable().describe(`${SHORT_CODE_NOTE}. \`null\` if the operator has none`),
  sortPriority: z.number().int().nullable().describe(SORT_PRIORITY_NOTE),
  primaryPlmn: z
    .string()
    .nullable()
    .describe("The `plmn` of the entry in `plmns` whose `role` is `primary`, repeated for convenience. To change it, send `plmns`"),
  plmns: z.array(plmnSchema).describe("The operator's network codes"),
  links: z.array(operatorLinkSchema).describe("The shared networks this operator is a member of"),
});
export type Operator = z.infer<typeof operatorSchema>;

export const operatorParamsSchema = z.object({ id: idParamSchema });

export const operatorListQuerySchema = z.object({ countryCodes: csvCountryCodesSchema.optional() }).strict();
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
