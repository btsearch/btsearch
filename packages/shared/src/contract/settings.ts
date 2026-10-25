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
  commentReview: z
    .boolean()
    .describe(
      "New comments need a moderator's approval before they are shown, and so does an approved comment whose author changes its text. " +
        "Comments that a moderator writes or edits skip the review",
    ),
  lists: z.boolean().describe("Users can create and share lists"),
  measurementUploads: z.boolean().describe("The BTSearch app can register devices and upload measurements"),
  observations: z
    .boolean()
    .describe(
      "Observed cells, estimated sites, coverage and trails. While it is off, the public site list, statistics and tiles answer 403 to everyone, " +
        "and only administrators keep the other `/observed` reads, their own trails and the staff trails",
    ),
});
export type SettingsFeatures = z.infer<typeof settingsFeaturesSchema>;

export const settingsAnnouncementSchema = z.object({
  isEnabled: z.boolean(),
  type: z.enum(ANNOUNCEMENT_TYPES),
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

export const settingsMeasurementsSchema = z.object({
  rawRetentionDays: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .describe("How long a raw upload file is kept after it arrives. Lowering it deletes the older files at the next hourly purge"),
  rawStorageBudgetGib: z
    .number()
    .int()
    .min(1)
    .max(100_000)
    .describe("Once the kept raw files reach it, uploads are refused with 503 and the app sends them again later"),
  minAppVersionCode: z
    .number()
    .int()
    .min(1)
    .max(2_100_000_000)
    .describe("Builds of the app with a lower `versionCode` can no longer register a device or upload"),
  termsVersion: z.number().int().min(1).max(32_767).describe("Raising it asks every contributor to accept the terms again before their next upload"),
  publishedAlgorithmVersion: z
    .number()
    .int()
    .min(1)
    .max(32_767)
    .describe("The site estimator version whose estimates are shown and matched to stations"),
  publicRadiusMaxMeters: z
    .number()
    .int()
    .min(100)
    .max(10_000)
    .describe("An estimated site that did not snap to a known place is public only when its 95 % radius is at most this"),
});
export type SettingsMeasurements = z.infer<typeof settingsMeasurementsSchema>;

export const settingsSchema = z.object({
  isMaintenanceMode: z
    .boolean()
    .describe("When `true`, only administrators can use the site. Sign-in, account recovery, the settings and the health check stay available"),
  isSignInRequired: z
    .boolean()
    .describe("When `true`, guests are rejected everywhere except the open routes, the sign-in routes and `GET /settings`"),
  features: settingsFeaturesSchema.describe(
    "While `submissions`, `photoUploads`, `comments`, `lists`, `measurementUploads` or `observations` is disabled, its routes respond with 403 `FEATURE_DISABLED`. " +
      "Moderating and deleting comments, and deleting the photos of rejected submissions, keep working. " +
      "Without `measurementUploads`, only device challenges, registering a device, uploading and accepting the terms stop",
  ),
  announcement: settingsAnnouncementSchema.nullable().describe("The site banner. `null` while it is disabled, unless you are an administrator"),
  access: settingsAccessSchema.optional().describe("Only returned to administrators"),
  measurements: settingsMeasurementsSchema.optional().describe("Only returned to administrators"),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = z
  .object({
    isMaintenanceMode: z
      .boolean()
      .optional()
      .describe("When `true`, only administrators can use the site. Sign-in, account recovery, the settings and the health check stay available"),
    isSignInRequired: z
      .boolean()
      .optional()
      .describe("When `true`, guests are rejected everywhere except the open routes, the sign-in routes and `GET /settings`"),
    features: settingsFeaturesSchema.partial().strict().refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE).optional(),
    announcement: z
      .object({
        isEnabled: z.boolean().optional(),
        type: z.enum(ANNOUNCEMENT_TYPES).optional(),
        message: z.string().max(ANNOUNCEMENT_MESSAGE_MAX_LENGTH).optional(),
      })
      .strict()
      .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
      .optional(),
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
    measurements: settingsMeasurementsSchema.partial().strict().refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE).optional(),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const settingsConflictSchema = z.object({ kind: z.enum(["busy", "noEstimate"]) });
export type SettingsConflict = z.infer<typeof settingsConflictSchema>;
