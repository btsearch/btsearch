import { z } from "zod/v4";

import { COMMENT_INCLUDES, COMMENT_SORTS } from "./comments.ts";
import {
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_TOTAL_NOTE,
  LIMIT_NOTE,
  booleanQuerySchema,
  csvEnumSchema,
  csvIdsSchema,
  csvUuidsSchema,
  cursorSchema,
  limitSchema,
  offsetSchema,
  pagingSchema,
  userRefSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { USER_ROLES } from "./me.ts";

export const PROFILE_VISIBILITIES = ["public", "private"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export const USER_INCLUDES = ["account"] as const;
export type UserInclude = (typeof USER_INCLUDES)[number];

export const USER_SORTS = ["name", "createdAt", "-createdAt"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export const USER_SEARCH_MIN_LENGTH = 2;

export const userContactSchema = z.object({
  instagram: z.string().nullable().describe("The Instagram handle, without the leading `@`"),
  facebook: z.string().nullable().describe("A link to the Facebook profile, starting with `https://`"),
  email: z.string().nullable().describe("The contact address the user chose to show, which can differ from the account's email"),
});
export type UserContact = z.infer<typeof userContactSchema>;

export const userCommentSummarySchema = z.object({
  total: z.number().int().nonnegative().describe("The number of approved comments the user wrote on stations in countries you can access"),
  operatorCounts: z
    .array(z.object({ operatorId: z.number().int().nullable(), count: z.number().int().nonnegative() }))
    .describe("The same comments counted per station operator, largest count first. `operatorId` is `null` for stations without an operator"),
});
export type UserCommentSummary = z.infer<typeof userCommentSummarySchema>;

export const userProfileSchema = z.object({
  id: z.uuid(),
  username: z.string().nullable(),
  name: z.string().nullable().describe("`null` for private profiles, unless you are the owner or a staff member"),
  image: z.string().nullable(),
  bio: z.string().nullable().describe("The user's description of themselves. `null` if there is none or the profile is restricted"),
  role: z.enum(USER_ROLES).nullable().describe("`null` whenever `name` is hidden"),
  visibility: z
    .enum(PROFILE_VISIBILITIES)
    .describe(
      "A `private` profile hides its name and role from everyone except its owner and staff, " +
        "and its bio, contact details, `hunterRegionIds` and comment counts from everyone except its owner",
    ),
  isRestricted: z.boolean().describe("`true` when the profile is private and you are not its owner"),
  contact: userContactSchema.nullable().describe("Only returned to signed-in users when the profile is not restricted, and always to the owner"),
  isContactHidden: z.boolean().describe("`true` when contact details exist and are returned once you sign in"),
  hunterRegionIds: z
    .array(z.number().int())
    .nullable()
    .describe(
      "The regions where the user helps find and document stations, as listed in the site's hunters directory. " +
        "`null` if the user is not listed there, has chosen no regions, or has a private profile",
    ),
  comments: userCommentSummarySchema.nullable().describe("`null` if comments are disabled or the profile is restricted"),
  createdAt: z.iso.datetime(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const userParamsSchema = z.object({ username: z.string().min(1).max(64) });

export const userCommentListQuerySchema = z
  .object({
    operatorIds: csvIdsSchema.optional().describe("Only comments on stations of these operators. Comma-separated ids"),
    sort: z.enum(COMMENT_SORTS).default("-createdAt").describe("The field to sort by, with a leading `-` for descending order"),
    include: csvEnumSchema(COMMENT_INCLUDES).optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type UserCommentListQuery = z.infer<typeof userCommentListQuerySchema>;

export const userAccountSchema = z.object({
  email: z.string(),
  isEmailVerified: z.boolean(),
  role: z.enum(USER_ROLES),
  isBanned: z.boolean().describe("Whether a ban is in force; `false` once `banExpiresAt` has passed"),
  banReason: z.string().nullable(),
  banExpiresAt: z.iso.datetime().nullable().describe("`null` if there is no ban or the ban never expires"),
  createdAt: z.iso.datetime(),
});
export type UserAccount = z.infer<typeof userAccountSchema>;

const ADMIN_SESSION_NOTE = "Requires an administrator's session; not available with a token";

export const listedUserSchema = userRefSchema.extend({
  account: userAccountSchema.optional().describe(`Only returned with \`include=account\`. ${ADMIN_SESSION_NOTE}`),
});
export type ListedUser = z.infer<typeof listedUserSchema>;

const USER_SEARCH_NOTE =
  "Matches part of a username or a name. With an administrator's session, email addresses are searched too. " +
  `Everyone else must send at least ${USER_SEARCH_MIN_LENGTH} characters, or use \`ids\` instead`;

export const userListQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((value) => !value.includes("\u0000"), { message: "Must not contain a null character" })
      .optional()
      .describe(USER_SEARCH_NOTE),
    ids: csvUuidsSchema.optional(),
    roles: csvEnumSchema(USER_ROLES)
      .optional()
      .describe(`${ADMIN_SESSION_NOTE}. Comma-separated list. Possible values: \`${USER_ROLES.join("`, `")}\``),
    isBanned: booleanQuerySchema.optional().describe(ADMIN_SESSION_NOTE),
    include: csvEnumSchema(USER_INCLUDES)
      .optional()
      .describe(`${ADMIN_SESSION_NOTE}. Comma-separated list. Possible values: \`${USER_INCLUDES.join("`, `")}\``),
    sort: z
      .enum(USER_SORTS)
      .default("name")
      .describe("The field to sort by, with a leading `-` for descending order. A `cursor` only works with the `sort` it was returned for"),
    limit: z.coerce.number<number>().int().min(1).max(100).default(25).describe(LIMIT_NOTE),
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const userListSchema = z.object({
  data: z.array(listedUserSchema),
  paging: pagingSchema,
});
export type UserList = z.infer<typeof userListSchema>;
