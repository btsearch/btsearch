import { z } from "zod/v4";

import { AT_LEAST_ONE_FIELD_ISSUE, hasAnyField } from "./common.ts";

export const ANNOUNCEMENT_TYPES = ["info", "warning", "error"] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export const ANNOUNCEMENT_MESSAGE_MAX_LENGTH = 1000;
export const ROUTE_RULE_LIMIT = 100;

const ROUTE_RULE_NOTE =
  "Each entry is a prefix of a route as the server registers it, for example `/api/v2/submissions` or `/api/v2/stations/:id/comments`. " +
  "Under `/api/v1/auth/` it is a prefix of the request path instead, for example `/api/v1/auth/sign-up`";

const routeRuleSchema = z
  .string()
  .max(200)
  .regex(/^\/api\/v[12]\/.+/, "Must be a specific path under /api/v1/ or /api/v2/");
const routeRulesSchema = z.array(routeRuleSchema).max(ROUTE_RULE_LIMIT);

export const settingsFeaturesSchema = z.object({
  submissions: z.boolean().describe("Submissions can be sent, read and reviewed"),
  photoUploads: z.boolean().describe("Photos can be added to a submission"),
  comments: z.boolean().describe("Station comments can be read and written"),
  commentReview: z.boolean().describe("New comments need a moderator's approval before they are shown, unless a moderator wrote them"),
  lists: z.boolean().describe("Users can create and share lists"),
});
export type SettingsFeatures = z.infer<typeof settingsFeaturesSchema>;

export const settingsAnnouncementSchema = z.object({
  isEnabled: z.boolean(),
  type: z.enum(ANNOUNCEMENT_TYPES).describe("The severity of the banner"),
  message: z.string(),
});
export type SettingsAnnouncement = z.infer<typeof settingsAnnouncementSchema>;

export const settingsAccessSchema = z.object({
  openRoutes: z
    .array(z.string())
    .describe(`Routes guests can still access while sign-in is required. A route's own guest and permission rules still apply. ${ROUTE_RULE_NOTE}`),
  disabledRoutes: z.array(z.string()).describe(`Routes that respond with 403 to everyone. ${ROUTE_RULE_NOTE}`),
});
export type SettingsAccess = z.infer<typeof settingsAccessSchema>;

export const settingsSchema = z.object({
  isSignInRequired: z
    .boolean()
    .describe("When `true`, guests are rejected everywhere except the open routes, the sign-in routes and `GET /settings`"),
  features: settingsFeaturesSchema.describe(
    "While `submissions`, `photoUploads`, `comments` or `lists` is disabled, its routes respond with 403 `FEATURE_DISABLED`. " +
      "Moderating and deleting comments, and deleting the photos of rejected submissions, keep working",
  ),
  announcement: settingsAnnouncementSchema.nullable().describe("The site banner. `null` while it is disabled, unless you are an administrator"),
  access: settingsAccessSchema.optional().describe("Only returned to administrators"),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = z
  .object({
    isSignInRequired: z
      .boolean()
      .optional()
      .describe("When `true`, guests are rejected everywhere except the open routes, the sign-in routes and `GET /settings`"),
    features: settingsFeaturesSchema
      .partial()
      .strict()
      .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
      .optional()
      .describe("Updates the features you send and leaves the rest unchanged"),
    announcement: z
      .object({
        isEnabled: z.boolean().optional(),
        type: z.enum(ANNOUNCEMENT_TYPES).optional().describe("The severity of the banner"),
        message: z.string().max(ANNOUNCEMENT_MESSAGE_MAX_LENGTH).optional(),
      })
      .strict()
      .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
      .optional()
      .describe("Updates the fields you send and leaves the rest unchanged"),
    access: z
      .object({
        openRoutes: routeRulesSchema
          .optional()
          .describe("Routes guests can still access while sign-in is required. A route's own guest and permission rules still apply"),
        disabledRoutes: routeRulesSchema.optional().describe("Must not cover the sign-in routes, the settings routes or the health check"),
      })
      .strict()
      .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
      .optional()
      .describe(`Any list you send replaces the stored one. ${ROUTE_RULE_NOTE}`),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
