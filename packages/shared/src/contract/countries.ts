import { z } from "zod/v4";

import { AT_LEAST_ONE_FIELD_ISSUE, countryCodeSchema, hasAnyField } from "./common.ts";

export const CONTRIBUTION_MODES = ["closed", "open"] as const;
export type ContributionMode = (typeof CONTRIBUTION_MODES)[number];

export const COUNTRY_TOOLS = ["analyzer", "measurements"] as const;
export type CountryTool = (typeof COUNTRY_TOOLS)[number];

const VISIBILITY_NOTE = "A hidden country and everything in it are only returned to administrators and to editors with a grant in that country";
const CONTRIBUTIONS_NOTE = "A `closed` country does not accept submissions. Independent of `isVisible`";
const DEFAULT_VIEW_NOTE = "The default map view for the country, as a bounding box in degrees";
const TOOLS_NOTE =
  "Without `analyzer`, `POST /cells/match` answers the cells of the country's networks with the reason `analyzerDisabled`, " +
  "and `POST /cells/apply` and submissions with `origin` set to `analyzer` are refused for its stations with 403 `FEATURE_DISABLED`. " +
  "Without `measurements`, the BTSearch app records nothing there, and readings from the country are dropped when uploads are processed";

const countryToolsSchema = z
  .array(z.enum(COUNTRY_TOOLS))
  .max(COUNTRY_TOOLS.length)
  .refine((tools) => new Set(tools).size === tools.length, { message: "Must not repeat a tool" });

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
  observationsPublic: z
    .boolean()
    .describe(
      "Observed cells, estimated sites, coverage and trails measured in the country are shown to everyone. " +
        "While it is off, only editors with a grant in the country and administrators get its cells and sites, and only administrators get its trails",
    ),
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
  officialStatuses: z.boolean().describe("The register says whether official sites are in service, so their `status` is not `null`"),
  kmz: z.boolean().describe("KMZ files of the official data can be downloaded from the endpoints under `/api/v1/kmz`"),
  editableHostStations: z
    .boolean()
    .describe("Station changes can set `hostStationId` in the country. `false` where host stations are worked out from the official sites"),
});
export type CountryCapabilities = z.infer<typeof countryCapabilitiesSchema>;

export const countrySchema = z.object({
  code: countryCodeSchema,
  isVisible: z.boolean().describe(VISIBILITY_NOTE),
  contributions: z.enum(CONTRIBUTION_MODES).describe(CONTRIBUTIONS_NOTE),
  tools: z.array(z.enum(COUNTRY_TOOLS)).describe(TOOLS_NOTE),
  features: countryFeaturesSchema.describe("What is collected and shown in the country, while `tools` says what works there"),
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
    tools: countryToolsSchema.optional().describe(`${TOOLS_NOTE}. Defaults to every tool`),
    features: countryFeaturesUpdateSchema
      .optional()
      .describe("New owner proposals and public observations default to true. PSC and BSIC default to false"),
    defaultView: boundingBoxSchema.nullable().optional().describe(DEFAULT_VIEW_NOTE),
  })
  .strict();
export type CountryCreate = z.infer<typeof countryCreateSchema>;

export const countryUpdateSchema = z
  .object({
    isVisible: z.boolean().optional().describe(VISIBILITY_NOTE),
    contributions: z.enum(CONTRIBUTION_MODES).optional().describe(CONTRIBUTIONS_NOTE),
    tools: countryToolsSchema.optional().describe(`${TOOLS_NOTE}. Replaces the whole list`),
    features: countryFeaturesUpdateSchema.optional(),
    defaultView: boundingBoxSchema.nullable().optional().describe(DEFAULT_VIEW_NOTE),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type CountryUpdate = z.infer<typeof countryUpdateSchema>;
