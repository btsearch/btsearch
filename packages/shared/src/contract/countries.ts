import { z } from "zod/v4";

import { AT_LEAST_ONE_FIELD_ISSUE, countryCodeSchema, hasAnyField } from "./common.ts";

export const CONTRIBUTION_MODES = ["closed", "open"] as const;
export type ContributionMode = (typeof CONTRIBUTION_MODES)[number];

const VISIBILITY_NOTE = "A hidden country and everything in it are only returned to administrators and to editors with a grant in that country";
const CONTRIBUTIONS_NOTE = "A `closed` country does not accept submissions. Independent of `isVisible`";
const DEFAULT_VIEW_NOTE = "The default map view for the country, as a bounding box in degrees";

export const boundingBoxSchema = z
  .object({
    west: z.number().min(-180).max(180),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90),
  })
  .strict()
  .refine((box) => box.south < box.north, { path: ["north"], message: "Must be greater than south" });
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export const countryFeaturesSchema = z.object({
  structureOwnerProposals: z.boolean().describe("Submitters can propose new structure owners"),
  psc: z
    .boolean()
    .describe("UMTS primary scrambling codes can be collected and displayed. Disabling this hides existing values without deleting them"),
  bsic: z
    .boolean()
    .describe("GSM base station identity codes can be collected and displayed. Disabling this hides existing values without deleting them"),
});
export type CountryFeatures = z.infer<typeof countryFeaturesSchema>;

const countryFeaturesUpdateSchema = countryFeaturesSchema.partial().strict().refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);

export const countryCapabilitiesSchema = z.object({
  official: z.boolean().describe("Official sites and their permits are available"),
  microwaveLinks: z.boolean(),
  emf: z.boolean().describe("Electromagnetic field data is available"),
  terrainProfiles: z
    .object({ receiverBounds: boundingBoxSchema.describe("The area the receiver has to be in, as a bounding box in degrees") })
    .nullable()
    .describe("Terrain profiles can be requested for stations in the country. `null` if they cannot"),
  kmz: z.boolean().describe("KMZ files of the official data can be downloaded from the endpoints under `/api/v1/kmz`"),
});
export type CountryCapabilities = z.infer<typeof countryCapabilitiesSchema>;

export const countrySchema = z.object({
  code: countryCodeSchema,
  isVisible: z.boolean().describe(VISIBILITY_NOTE),
  contributions: z.enum(CONTRIBUTION_MODES).describe(CONTRIBUTIONS_NOTE),
  features: countryFeaturesSchema,
  capabilities: countryCapabilitiesSchema,
  defaultView: boundingBoxSchema.nullable().describe(DEFAULT_VIEW_NOTE),
});
export type Country = z.infer<typeof countrySchema>;

export const countryParamsSchema = z.object({ code: countryCodeSchema });

export const countryCreateSchema = z
  .object({
    code: countryCodeSchema,
    isVisible: z.boolean().optional().describe(`${VISIBILITY_NOTE}. Defaults to \`false\``),
    contributions: z.enum(CONTRIBUTION_MODES).optional().describe(`${CONTRIBUTIONS_NOTE}. Defaults to \`closed\``),
    features: countryFeaturesUpdateSchema.optional().describe("New owner proposals default to true. PSC and BSIC default to false"),
    defaultView: boundingBoxSchema.nullable().optional().describe(DEFAULT_VIEW_NOTE),
  })
  .strict();
export type CountryCreate = z.infer<typeof countryCreateSchema>;

export const countryUpdateSchema = z
  .object({
    isVisible: z.boolean().optional().describe(VISIBILITY_NOTE),
    contributions: z.enum(CONTRIBUTION_MODES).optional().describe(CONTRIBUTIONS_NOTE),
    features: countryFeaturesUpdateSchema.optional(),
    defaultView: boundingBoxSchema.nullable().optional().describe(DEFAULT_VIEW_NOTE),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type CountryUpdate = z.infer<typeof countryUpdateSchema>;
