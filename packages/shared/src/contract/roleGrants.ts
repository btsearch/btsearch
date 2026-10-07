import { z } from "zod/v4";

import {
  countryCodeSchema,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvUuidsSchema,
  cursorSchema,
  idSchema,
  limitSchema,
  pagingSchema,
  userRefSchema,
} from "./common.ts";

export const GRANT_ROLES = ["editor", "maintainer"] as const;
export type GrantRole = (typeof GRANT_ROLES)[number];

export const ROLE_GRANT_INCLUDES = ["user"] as const;
export type RoleGrantInclude = (typeof ROLE_GRANT_INCLUDES)[number];

const regionIdsInputSchema = z
  .array(idSchema)
  .min(1)
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length, { message: "Region ids must be unique" })
  .nullable();

const GRANT_ROLE_NOTE =
  "`editor` lets the user edit the data of the country, or only of the regions in `regionIds`. " +
  "`maintainer` covers the whole country and also lets the user manage its `editor` grants and read and revert its audit operations";
const REGION_IDS_INPUT_NOTE =
  "The regions the grant is limited to, or `null` to cover the whole country. " +
  "The regions must be in the grant's country, and a `maintainer` grant only accepts `null`";

export const roleGrantSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  role: z.enum(GRANT_ROLES).describe(GRANT_ROLE_NOTE),
  countryCode: countryCodeSchema,
  regionIds: z.array(idSchema).nullable().describe("The regions the grant is limited to, or `null` if it covers the whole country"),
  grantedById: z.uuid().nullable().describe("The user who created the grant. `null` if unknown, for example after that account is deleted"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  user: userRefSchema.optional().describe("The user the grant belongs to. Only returned with `include=user`"),
});
export type RoleGrant = z.infer<typeof roleGrantSchema>;

export const roleGrantParamsSchema = z.object({ id: z.uuid() });

export const roleGrantListQuerySchema = z
  .object({
    userIds: csvUuidsSchema.optional(),
    countryCodes: csvCountryCodesSchema.optional(),
    include: csvEnumSchema(ROLE_GRANT_INCLUDES).optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
  })
  .strict();
export type RoleGrantListQuery = z.infer<typeof roleGrantListQuerySchema>;

export const roleGrantListSchema = z.object({
  data: z.array(roleGrantSchema),
  paging: pagingSchema,
});
export type RoleGrantList = z.infer<typeof roleGrantListSchema>;

export const roleGrantCreateSchema = z
  .object({
    userId: z.uuid(),
    role: z.enum(GRANT_ROLES).describe(`${GRANT_ROLE_NOTE}. Only administrators can create a \`maintainer\` grant`),
    countryCode: countryCodeSchema,
    regionIds: regionIdsInputSchema.describe(REGION_IDS_INPUT_NOTE),
  })
  .strict()
  .refine((grant) => grant.role !== "maintainer" || grant.regionIds === null, {
    path: ["regionIds"],
    message: "A maintainer grant covers the whole country",
  });
export type RoleGrantCreate = z.infer<typeof roleGrantCreateSchema>;

export const roleGrantUpdateSchema = z
  .object({
    regionIds: regionIdsInputSchema.describe(`${REGION_IDS_INPUT_NOTE}. The list you send replaces the stored one`),
  })
  .strict();
export type RoleGrantUpdate = z.infer<typeof roleGrantUpdateSchema>;
