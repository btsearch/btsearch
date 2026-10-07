import { z } from "zod/v4";

import { INCLUDE_TOTAL_NOTE, booleanQuerySchema, cursorSchema, instantSchema, limitSchema, pagingSchema, userRefSchema } from "./common.ts";
import { SUBMISSION_ACTIONS } from "./submissions.ts";

export const NOTIFICATION_TYPES = [
  "submissionAccepted",
  "submissionRejected",
  "submissionPhotoUploadFailed",
  "submissionCreated",
  "stationCellsChanged",
  "stationPhotosAdded",
  "stationCommentApproved",
  "officialPermitsChanged",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const PUSH_TOPICS = ["officialDataUpdates", "submissionUpdates", "newSubmissions", "stationWatches"] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number];

const countSchema = z.number().int().nonnegative();
const SITE_NOTE = "`null` if nothing is known about it";
const SITE_OPERATOR_NOTE =
  "The operator of the station or site. If the station or site does not exist yet or no longer exists, " +
  "this is the operator that was stored with the notification, as long as it can still be matched to an operator. `null` if there is none";
const SITE_LOCATION_NOTE =
  "Where the station or site is, so you can point to it on a map. If it has no location of its own, for example because it no longer exists, " +
  "this is the position that was stored with the notification. `null` if no position is known";

export const notificationSiteSchema = z.object({
  id: z
    .number()
    .int()
    .nullable()
    .describe("`null` if the station does not exist yet or has been deleted. `siteId` is then the label stored with the notification"),
  siteId: z.string().nullable(),
  operatorId: z.number().int().nullable().describe(SITE_OPERATOR_NOTE),
  location: z.object({ latitude: z.number(), longitude: z.number() }).nullable().describe(SITE_LOCATION_NOTE),
});
export type NotificationSite = z.infer<typeof notificationSiteSchema>;

export const notificationSubmissionSchema = z.object({
  id: z.uuid(),
  action: z
    .enum(SUBMISSION_ACTIONS)
    .nullable()
    .describe("What the submission asks for: to add a station, change one or deactivate one. `null` if unknown"),
});

const notificationShape = {
  isRead: z.boolean(),
  readAt: z.iso.datetime().nullable().describe("When the notification was marked as read, or `null` if it is unread"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().describe("The time of the newest event in the notification. Marking the notification as read does not change it"),
  count: z.number().int().positive().describe("The number of events merged into this notification"),
};
const stationPart = { station: notificationSiteSchema.nullable().describe(SITE_NOTE) };
const submissionPart = {
  submission: notificationSubmissionSchema
    .nullable()
    .describe("The submission the notification is about. Always `null` for `submissionPhotoUploadFailed`, where the submission has been deleted"),
  station: notificationSiteSchema.nullable().describe(`The station the submission is about, or ${SITE_NOTE}`),
};

export const submissionReviewedNotificationSchema = z.object({
  id: z.uuid(),
  type: z
    .enum(["submissionAccepted", "submissionRejected"])
    .describe("Sent to the submitter when a reviewer accepts the submission and its changes are written, or rejects it"),
  ...notificationShape,
  ...submissionPart,
  reviewer: userRefSchema.nullable().describe("The user who reviewed the submission, or `null` if unknown"),
  reviewNote: z.string().nullable().describe("The reviewer's note for the submitter, or `null` if there is none"),
});

export const submissionCreatedNotificationSchema = z.object({
  id: z.uuid(),
  type: z.literal("submissionCreated").describe("Sent to staff when a submission is waiting for review"),
  ...notificationShape,
  ...submissionPart,
  submitter: userRefSchema.nullable().describe("The user who sent the submission, or `null` if unknown"),
});

export const submissionPhotoUploadFailedNotificationSchema = z.object({
  id: z.uuid(),
  type: z
    .literal("submissionPhotoUploadFailed")
    .describe("Sent to the submitter when the submission was deleted because its photos were not uploaded in time"),
  ...notificationShape,
  ...submissionPart,
});

export const stationCellsChangedNotificationSchema = z.object({
  id: z.uuid(),
  type: z.literal("stationCellsChanged").describe("Sent when cells of a station you watch are added, changed or removed"),
  ...notificationShape,
  ...stationPart,
  cells: z
    .object({ added: countSchema, removed: countSchema, updated: countSchema })
    .describe("How many cells were added, removed and updated in the merged events"),
});

export const stationNotificationSchema = z.object({
  id: z.uuid(),
  type: z
    .enum(["stationPhotosAdded", "stationCommentApproved"])
    .describe("Sent when an approved submission adds photos to a station you watch, or a comment on it is approved"),
  ...notificationShape,
  ...stationPart,
});

export const officialPermitsChangedNotificationSchema = z.object({
  id: z.uuid(),
  type: z.literal("officialPermitsChanged").describe("Sent when the official permits of a station or official site you watch change"),
  ...notificationShape,
  ...stationPart,
  officialSite: notificationSiteSchema
    .nullable()
    .describe(
      "Set instead of `station` when the permits belong to a register site without a station. " +
        "For a site that was removed from the register, its `id` is `null` and its `location` is where the site stood",
    ),
  permits: z.object({ added: countSchema, removed: countSchema }).describe("How many permits were added and removed in the merged events"),
  officialSitesAdded: countSchema.describe("How many sites newly added to the official register are linked to the station"),
  isRemovedFromRegister: z.boolean().describe("`true` if the watched official site lost its last permit and was removed from the register"),
});

export const notificationSchema = z.discriminatedUnion("type", [
  submissionReviewedNotificationSchema,
  submissionCreatedNotificationSchema,
  submissionPhotoUploadFailedNotificationSchema,
  stationCellsChangedNotificationSchema,
  stationNotificationSchema,
  officialPermitsChangedNotificationSchema,
]);
export type Notification = z.infer<typeof notificationSchema>;

export const notificationParamsSchema = z.object({ id: z.uuid() });

export const notificationListQuerySchema = z
  .object({
    isRead: booleanQuerySchema.optional().describe("`true` returns only read notifications, `false` only unread ones"),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict();
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListSchema = z.object({
  data: z.array(notificationSchema),
  paging: pagingSchema,
});
export type NotificationList = z.infer<typeof notificationListSchema>;

export const unreadNotificationsSchema = z.object({ count: countSchema });
export type UnreadNotifications = z.infer<typeof unreadNotificationsSchema>;

export const notificationsReadQuerySchema = z
  .object({ updatedBefore: instantSchema.optional().describe("Marks only notifications last updated at or before this time") })
  .strict();
export type NotificationsReadQuery = z.infer<typeof notificationsReadQuerySchema>;

export const pushTopicsSchema = z.object({
  officialDataUpdates: z.boolean().describe("Whether to send a push after new official register data has been imported. Disabled by default"),
  submissionUpdates: z
    .boolean()
    .describe("Whether to send a push when one of your submissions is approved, rejected, or deleted because its photos were not uploaded"),
  newSubmissions: z.boolean().describe("Whether to send a push when a new submission is waiting for review. Only staff receive these"),
  stationWatches: z.boolean().describe("Whether to send a push about changes to stations you watch"),
});
export type PushTopics = z.infer<typeof pushTopicsSchema>;

export const pushSubscriptionSchema = z.object({
  id: z.uuid(),
  topics: pushTopicsSchema.describe("The kinds of push notification this subscription receives"),
  createdAt: z.iso.datetime(),
});
export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;

export const pushSubscriptionParamsSchema = z.object({ id: z.uuid() });

const PLAIN_HTTPS_ADDRESS = /^https:\/\/[^/?#@:]+(?:[/?#]|$)/;

export const pushEndpointSchema = z
  .url({ protocol: /^https$/, hostname: z.regexes.domain, normalize: true })
  .max(2048)
  .refine((value) => PLAIN_HTTPS_ADDRESS.test(value), { message: "Must be an https address on the standard port, without a user name" });

export const pushSubscriptionCreateSchema = z
  .object({
    endpoint: pushEndpointSchema.describe("The `endpoint` of the browser's `PushSubscription`. Must be an https address on the standard port"),
    keys: z
      .object({
        p256dh: z.string().min(1).max(256),
        auth: z.string().min(1).max(256),
      })
      .strict()
      .describe("The `p256dh` and `auth` keys of the browser's `PushSubscription`, as returned by its `toJSON()` method"),
  })
  .strict();
export type PushSubscriptionCreate = z.infer<typeof pushSubscriptionCreateSchema>;

export const pushSubscriptionUpdateSchema = z
  .object({
    topics: pushTopicsSchema
      .partial()
      .strict()
      .refine((topics) => Object.keys(topics).length > 0, { message: "At least one topic is required" })
      .describe("The topics to change. Omitted topics keep their current setting"),
  })
  .strict();
export type PushSubscriptionUpdate = z.infer<typeof pushSubscriptionUpdateSchema>;

export const stationWatchSchema = z.object({
  isWatched: z.boolean().describe("Whether you watch the station directly. Following it through a list with notifications does not count"),
});
export type StationWatch = z.infer<typeof stationWatchSchema>;
