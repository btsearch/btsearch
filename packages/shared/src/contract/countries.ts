import { z } from "zod/v4";

import { AT_LEAST_ONE_FIELD_ISSUE, countryCodeSchema, hasAnyField } from "./common.ts";

export const CONTRIBUTION_MODES = ["closed", "open"] as const;
export type ContributionMode = (typeof CONTRIBUTION_MODES)[number];

const VISIBILITY_NOTE =
  "Whether the country is visible to the public. A hidden country and everything in it, such as its regions, operators and stations, " +
  "are only returned to administrators and to editors with a grant in that country";
const CONTRIBUTIONS_NOTE =
  "Whether the country accepts contributions. It is separate from `isVisible`. A country does not accept submissions while it is `closed`";
const DEFAULT_VIEW_NOTE = "The default map view for the country, as a bounding box in degrees";

export const countryViewSchema = z
  .object({
    west: z.number().min(-180).max(180),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90),
  })
  .strict()
  .refine((view) => view.south < view.north, { path: ["north"], message: "Must be greater than south" });
export type CountryView = z.infer<typeof countryViewSchema>;

export const countryFeaturesSchema = z.object({
  structureOwnerProposals: z.boolean().describe("Submitters can propose new structure owners while existing owners remain selectable"),
  psc: z
    .boolean()
    .describe("UMTS primary scrambling codes can be collected and displayed. Disabling this hides existing values without deleting them"),
  bsic: z
    .boolean()
    .describe("GSM base station identity codes can be collected and displayed. Disabling this hides existing values without deleting them"),
});
export type CountryFeatures = z.infer<typeof countryFeaturesSchema>;

const countryFeaturesUpdateSchema = countryFeaturesSchema.partial().strict().refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);

export const countrySchema = z.object({
  code: countryCodeSchema,
  isVisible: z.boolean().describe(VISIBILITY_NOTE),
  contributions: z.enum(CONTRIBUTION_MODES).describe(CONTRIBUTIONS_NOTE),
  features: countryFeaturesSchema,
  defaultView: countryViewSchema.nullable().describe(`${DEFAULT_VIEW_NOTE}, or \`null\` if none is set`),
});
export type Country = z.infer<typeof countrySchema>;

export const countryParamsSchema = z.object({ code: countryCodeSchema });

export const countryCreateSchema = z
  .object({
    code: countryCodeSchema,
    isVisible: z.boolean().optional().describe(`${VISIBILITY_NOTE}. Defaults to \`false\``),
    contributions: z.enum(CONTRIBUTION_MODES).optional().describe(`${CONTRIBUTIONS_NOTE}. Defaults to \`closed\``),
    features: countryFeaturesUpdateSchema.optional().describe("New owner proposals default to true. PSC and BSIC default to false"),
    defaultView: countryViewSchema.nullable().optional().describe(`${DEFAULT_VIEW_NOTE}. If omitted, none is set`),
  })
  .strict();
export type CountryCreate = z.infer<typeof countryCreateSchema>;

export const countryUpdateSchema = z
  .object({
    isVisible: z.boolean().optional().describe(VISIBILITY_NOTE),
    contributions: z.enum(CONTRIBUTION_MODES).optional().describe(CONTRIBUTIONS_NOTE),
    features: countryFeaturesUpdateSchema.optional().describe("Updates only the supplied country features"),
    defaultView: countryViewSchema.nullable().optional().describe(`${DEFAULT_VIEW_NOTE}. \`null\` clears it`),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type CountryUpdate = z.infer<typeof countryUpdateSchema>;
