import { z } from "zod/v4";

import { AT_LEAST_ONE_FIELD_ISSUE, countryCodeSchema, csvCountryCodesSchema, csvEnumSchema, hasAnyField, idParamSchema, idSchema } from "./common.ts";

export const STRUCTURE_TYPES = [
  "latticeTower",
  "tubularTower",
  "concreteTower",
  "tower",
  "mast",
  "rooftopMast",
  "rooftop",
  "chimney",
  "church",
  "waterTower",
  "silo",
  "pole",
  "mobileMast",
  "tunnel",
  "indoor",
  "other",
] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

export const STRUCTURE_NOTE_MAX_LENGTH = 150;
export const STRUCTURE_OWNER_NAME_MAX_LENGTH = 100;

const STRUCTURE_TYPE_NOTE =
  "`tower` is a tower of unknown construction, `pole` is a lamp post, a power pylon or an advertising pylon, " +
  "and `mobileMast` is a temporary or relocatable mast";
const OWNER_COUNTRY_NOTE = "The country the entry belongs to. `null` for an owner that is not tied to a single country";

const structureOwnerNameSchema = z.string().trim().min(1).max(STRUCTURE_OWNER_NAME_MAX_LENGTH);

export const structureTypeSchema = z.enum(STRUCTURE_TYPES);

export const UNKNOWN_STRUCTURE_TYPE = "unknown";
export const STRUCTURE_TYPE_FILTER_VALUES = [...STRUCTURE_TYPES, UNKNOWN_STRUCTURE_TYPE] as const;

export const csvStructureTypesSchema = csvEnumSchema(STRUCTURE_TYPE_FILTER_VALUES).describe(
  `Comma-separated structure types. Use \`${UNKNOWN_STRUCTURE_TYPE}\` to match locations whose structure type is not known. ` +
    `Possible values: \`${STRUCTURE_TYPE_FILTER_VALUES.join("`, `")}\``,
);
export type StructureTypeFilter = z.infer<typeof csvStructureTypesSchema>;

export const structureOwnerSchema = z.object({
  id: z.number().int().describe("Id of the entry in the list of structure owners"),
  name: z.string().describe("The owner's name, for example Cellnex"),
  countryCode: countryCodeSchema.nullable().describe(OWNER_COUNTRY_NOTE),
  brandId: z.number().int().nullable().describe("The brand whose logo and color represent the owner, or `null` if the owner has none"),
  operatorId: z.number().int().nullable().describe("The operator, if the owner is one. An operator has at most one entry"),
});
export type StructureOwner = z.infer<typeof structureOwnerSchema>;

export const structureOwnerParamsSchema = z.object({ id: idParamSchema });

export const structureOwnerListQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema.optional().describe("Comma-separated two-letter country codes. Owners without a country are always listed"),
  })
  .strict();
export type StructureOwnerListQuery = z.infer<typeof structureOwnerListQuerySchema>;

const structureOwnerWriteShape = {
  name: structureOwnerNameSchema.describe(
    "The owner's name. Names must be unique within a country and among the owners without a country, and are compared case-insensitively",
  ),
  countryCode: countryCodeSchema.nullable().optional().describe(OWNER_COUNTRY_NOTE),
  brandId: idSchema.nullable().optional().describe("The brand whose logo and color represent the owner"),
  operatorId: idSchema
    .nullable()
    .optional()
    .describe("The operator, if the owner is one. An operator has at most one entry and must be from the entry's country if the entry has one"),
};

export const structureOwnerCreateSchema = z.object(structureOwnerWriteShape).strict();
export type StructureOwnerCreate = z.infer<typeof structureOwnerCreateSchema>;

export const structureOwnerUpdateSchema = z.object(structureOwnerWriteShape).partial().strict().refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type StructureOwnerUpdate = z.infer<typeof structureOwnerUpdateSchema>;

export const structureOwnerRefSchema = structureOwnerSchema.omit({ countryCode: true });
export type StructureOwnerRef = z.infer<typeof structureOwnerRefSchema>;

export const structureSchema = z.object({
  type: structureTypeSchema.nullable().describe(`The type of structure the antennas are mounted on, or \`null\` if unknown. ${STRUCTURE_TYPE_NOTE}`),
  owner: structureOwnerRefSchema.nullable().describe("The owner of the structure, or `null` if unknown"),
  note: z.string().nullable().describe("A short note, such as a detail of the building, the owner's own name for the site, or its history"),
});
export type Structure = z.infer<typeof structureSchema>;

export const STRUCTURE_INPUT_NOTE = "The structure the antennas are mounted on and who owns it. Omitted fields are left unchanged";

const OWNER_ID_INPUT_NOTE = "Id of an entry in the list of structure owners. `null` clears it";
const SUBMITTED_OWNER_ID_NOTE =
  `${OWNER_ID_INPUT_NOTE}. ` + "When you update a submission that proposes a new owner in `ownerName`, sending an id or `null` also drops that name";
const OWNER_NAME_INPUT_NOTE =
  `The name of an owner that is not in the list of structure owners yet, up to ${STRUCTURE_OWNER_NAME_MAX_LENGTH} characters. ` +
  "Send it instead of `ownerId`. If an owner with the same name, compared case-insensitively, already exists in the location's country " +
  "or among the owners without a country, that owner is used. Otherwise the owner is added to the list for the location's country " +
  "when the submission is accepted";
const OWNER_ID_OR_NAME_ISSUE = { path: ["ownerName"], message: "Use either ownerId or ownerName" };

const structureInputShape = {
  type: structureTypeSchema
    .nullable()
    .optional()
    .describe(`The type of structure the antennas are mounted on. \`null\` clears it. ${STRUCTURE_TYPE_NOTE}`),
  ownerId: idSchema.nullable().optional().describe(OWNER_ID_INPUT_NOTE),
  note: z
    .string()
    .trim()
    .max(STRUCTURE_NOTE_MAX_LENGTH)
    .nullable()
    .optional()
    .describe(`A short note of up to ${STRUCTURE_NOTE_MAX_LENGTH} characters. \`null\` clears it`),
};

export const structureInputSchema = z.object(structureInputShape).strict().refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type StructureInput = z.infer<typeof structureInputSchema>;

export const submittedStructureInputSchema = z
  .object({
    type: structureInputShape.type,
    ownerId: structureInputShape.ownerId.describe(SUBMITTED_OWNER_ID_NOTE),
    ownerName: structureOwnerNameSchema.optional().describe(OWNER_NAME_INPUT_NOTE),
    note: structureInputShape.note,
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
  .refine((structure) => structure.ownerId === undefined || structure.ownerName === undefined, OWNER_ID_OR_NAME_ISSUE);
export type SubmittedStructureInput = z.infer<typeof submittedStructureInputSchema>;
