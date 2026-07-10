import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm/sql";
import { nanoid } from "nanoid";

import { UkeSchema, locations, stations, ukeStations } from "./bts.ts";

export const NotificationType = pgEnum("notification_type", [
  "submission_approved",
  "submission_rejected",
  "new_submission",
  "station_cells_changed",
  "station_photos_added",
  "station_comment_approved",
  "station_uke_permit_added",
]);
export const CommentStatus = pgEnum("comment_status", ["pending", "approved"]);

export type CloudUserPreferences = {
  navMode?: "sidebar" | "floating";
  gpsFormat?: "decimal" | "dms";
  navigationApps?: ("google-maps" | "apple-maps" | "waze" | "osmand" | "openstreetmap")[];
  navLinksDisplay?: "inline" | "buttons";
  radiolinesMinZoom?: number;
  mapStationsLimit?: number;
  mapRadiolinesLimit?: number;
  showMapHoverTooltip?: boolean;
  mapPointStyle?: "dots" | "markers";
  mapRightClickMeasure?: boolean;
  mapMeasureCircle?: boolean;
  showStationPhotoPanel?: boolean;
  showElevation?: boolean;
  showAzimuths?: boolean;
  hideFiltersOnMapClick?: boolean;
  azimuthsMinZoom?: number;
  azimuthLineLength?: number;
  azimuthSpread?: number;
  cartoVariant?: "auto" | "dark" | "light";
};

export type CloudPreferences = {
  syncEnabled: boolean;
  desktop: CloudUserPreferences | null;
  mobile: CloudUserPreferences | null;
  favoriteLists?: string[];
};

export const Role = pgEnum("role", ["user", "moderator", "admin"]);
export const APITokenTier = pgEnum("api_token_tier", ["basic", "pro", "unlimited"]);
export const AuditAction = pgEnum("audit_action", [
  "stations.create",
  "stations.update",
  "stations.delete",
  "cells.create",
  "cells.update",
  "cells.delete",
  "locations.create",
  "locations.update",
  "locations.delete",
  "operators.create",
  "operators.update",
  "operators.delete",
  "bands.create",
  "bands.update",
  "bands.delete",
  "regions.create",
  "regions.update",
  "regions.delete",
  "submissions.create",
  "submissions.update",
  "submissions.delete",
  "submissions.approve",
  "submissions.reject",
  "submissions.cleanup",
  "settings.update",
  "station_comments.create",
  "station_comments.update",
  "station_comments.delete",
  "station_photos.create",
  "station_photos.update",
  "station_photos.delete",
  "location_photos.create",
  "location_photos.update",
  "location_photos.delete",
  "submission_photos.create",
  "submission_photos.update",
  "submission_photos.delete",
  "user_lists.create",
  "user_lists.update",
  "user_lists.delete",
  "uke_import.start",
]);
export const AuditSource = pgEnum("audit_source", ["api", "import", "system"]);
export const AuthSchema = pgSchema("auth");

export const users = AuthSchema.table(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    username: varchar("username", { length: 25 }).unique(),
    displayUsername: varchar("displayUsername", { length: 32 }),
    email: varchar("email", { length: 100 }).notNull().unique(),
    image: text("image"),
    name: text("name").notNull(),
    role: text("role").notNull().default("user"),
    emailVerified: boolean("emailVerified").default(false).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    banned: boolean("banned").default(false),
    banReason: text("banReason"),
    banExpires: timestamp({ withTimezone: true }),
    twoFactorEnabled: boolean("two_factor_enabled").default(false),
    forceTotp: boolean("force_totp").default(false),
    locale: varchar("locale", { length: 10 }).default("pl-PL"),
    bio: varchar("bio", { length: 500 }),
    contactInfo: jsonb("contact_info").$type<{ instagram?: string; facebook?: string; email?: string }>(),
    profileVisibility: text("profile_visibility").notNull().default("private"),
    hunterListing: boolean("hunter_listing").notNull().default(false),
    hunterRegions: jsonb("hunter_regions").$type<number[]>().default([]),
    cloudPreferences: jsonb("cloud_preferences").$type<CloudPreferences>(),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

// export const sessions = pgTable("sessions", {
// 	id: text("id").notNull().primaryKey(),
// 	userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
// 	expiresAt: timestamp({ withTimezone: true }).notNull(),
// 	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
// 	sessionToken: text("session_token").notNull().unique(),
// 	fresh: boolean("fresh").default(true),
// 	userAgent: text("user_agent"),
// 	ip: text("ip"),
// 	lastActiveAt: timestamp({ withTimezone: true }),
// });

export const accounts = AuthSchema.table(
  "accounts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    idToken: text("id_token"),
    scope: text("scope"),
    password: varchar("password", { length: 255 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verificationTokens = AuthSchema.table("verification_tokens", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`)
    .notNull(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const apikeys = AuthSchema.table(
  "apikeys",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull(),
    referenceId: uuid("reference_id").notNull(),
    configId: varchar("config_id", { length: 255 }).default("default").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { withTimezone: true }),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
    rateLimitMax: integer("rate_limit_max").default(10),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata").default('{"tier":"basic"}'),
  },
  (table) => [
    index("apikeys_key_idx").on(table.key),
    index("apikeys_referenceId_idx").on(table.referenceId),
    index("apikeys_configId_idx").on(table.configId),
  ],
);

export const passkeys = AuthSchema.table(
  "passkeys",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    aaguid: text("aaguid"),
  },
  (table) => [index("passkeys_userId_idx").on(table.userId), index("passkeys_credentialID_idx").on(table.credentialID)],
);

export const twoFactors = AuthSchema.table(
  "two_factors",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(false),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (table) => [index("twoFactors_secret_idx").on(table.secret), index("twoFactors_userId_idx").on(table.userId)],
);

/**
 * Attachments table
 * @example
 * { id: 1, name: "myfile.jpg", uuid: "12345678901234", author_id: 1, mime_type: "image/jpeg", size: 123456, createdAt: new Date(), updatedAt: new Date() }
 */
export const attachments = pgTable(
  "attachments",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    name: text("name").notNull(),
    uuid: uuid("uuid").notNull().defaultRandom().unique(),
    author_id: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    mime_type: varchar("mime_type", { length: 100 }).notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attachment_author_id_idx").on(table.author_id),
    index("attachments_created_at_idx").on(table.createdAt),
    check("attachments_size_nonneg", sql`${table.size} >= 0`),
    check("attachments_mime_format", sql`${table.mime_type} ~ '^[\\w.+-]+/[\\w.+-]+'`),
  ],
);

/**
 * User lists table
 * @example
 * { id: 1, uuid: "12345678901234", name: "My List", description: "My List Description", is_public: false, created_by: 1, stations: [1, 2, 3], createdAt: new Date(), updatedAt: new Date() }
 */
export const userLists = pgTable(
  "user_lists",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    uuid: text("uuid")
      .notNull()
      .$defaultFn(() => nanoid(14))
      .unique(),
    name: text("name").notNull(),
    description: text("description"),
    is_public: boolean("is_public").default(false),
    created_by: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    stations: jsonb("stations").$type<{ internal: number[]; uke: number[] }>().notNull(),
    notificationsEnabled: boolean("notifications_enabled").notNull().default(false),
    radiolines: jsonb("radiolines")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("user_lists_created_by_idx").on(t.created_by),
    unique("user_lists_creator_name_unique").on(t.created_by, t.name),
    check("user_lists_stations_is_object", sql`jsonb_typeof(${t.stations}) = 'object'`),
    index("user_lists_radiolines_gin").using("gin", t.radiolines),
    check("user_lists_radiolines_is_array", sql`jsonb_typeof(${t.radiolines}) = 'array'`),
  ],
);

export const stationWatches = pgTable(
  "station_watches",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stationId: integer("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("station_watches_user_id_idx").on(t.userId),
    index("station_watches_station_id_idx").on(t.stationId),
    unique("station_watches_user_station_unique").on(t.userId, t.stationId),
  ],
);

export const ukeStationWatches = UkeSchema.table(
  "uke_station_watches",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ukeStationId: integer("uke_station_id")
      .notNull()
      .references(() => ukeStations.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("uke_station_watches_user_id_idx").on(t.userId),
    index("uke_station_watches_uke_station_id_idx").on(t.ukeStationId),
    unique("uke_station_watches_user_station_unique").on(t.userId, t.ukeStationId),
  ],
);

/**
 * Station comments table
 * @example
 * { id: 1, station_id: 1, user_id: 1, attachments: [{ uuid: "12345678901234", type: "image/jpeg" }], content: "My Note", createdAt: new Date(), updatedAt: new Date() }
 */
export const stationComments = pgTable(
  "station_comments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    station_id: integer("station_id")
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    user_id: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    attachments: jsonb("attachments").$type<{ uuid: string; type: string }[]>(),
    content: text("content").notNull(),
    status: CommentStatus("status").notNull().default("approved"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("station_comments_station_id_idx").on(t.station_id),
    index("station_comments_user_id_idx").on(t.user_id),
    index("station_comments_station_created_idx").on(t.station_id, t.createdAt),
    check("station_comments_content_len", sql`char_length(${t.content}) BETWEEN 1 AND 10000`),
  ],
);

/**
 * Audit logs table
 * @example
 * { id: 1, action: "stations.create", table_name: "stations", record_id: 1, old_values: {}, new_values: {}, metadata: {}, source: "api", ip_address: "127.0.0.1", user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36", invoked_by: 1, createdAt: new Date() }
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    action: AuditAction("action").notNull(),
    table_name: varchar("table_name", { length: 100 }).notNull(),
    record_id: integer("record_id"),
    old_values: jsonb("old_values"),
    new_values: jsonb("new_values"),
    metadata: jsonb("metadata"),
    source: AuditSource("source"),
    ip_address: varchar("ip_address", { length: 60 }),
    user_agent: text("user_agent"),
    invoked_by: uuid("invoked_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_record_id_idx").on(table.record_id),
    index("audit_logs_invoked_by_idx").on(table.invoked_by),
    index("audit_logs_table_name_idx").on(table.table_name),
    index("audit_logs_date_created_idx").on(table.createdAt),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_table_name_created_idx").on(table.table_name, table.createdAt),
    index("audit_logs_action_created_idx").on(table.action, table.createdAt),
    index("audit_logs_invoked_by_created_idx").on(table.invoked_by, table.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: NotificationType("type").notNull(),
    title: text("title").notNull(),
    submissionId: uuid("submission_id"),
    stationId: integer("station_id").references(() => stations.id, { onDelete: "cascade" }),
    ukeStationId: integer("uke_station_id").references(() => ukeStations.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    actionUrl: text("action_url"),
    readAt: timestamp({ withTimezone: true }),
    pushQueuedAt: timestamp("push_queued_at", { withTimezone: true }),
    pushSentAt: timestamp("push_sent_at", { withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_id_idx").on(t.userId),
    index("notifications_created_at_idx").on(t.createdAt),
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    uniqueIndex("notifications_user_station_type_unread_unique")
      .on(t.userId, t.stationId, t.type)
      .where(sql`${t.readAt} IS NULL AND ${t.stationId} IS NOT NULL`),
    uniqueIndex("notifications_user_uke_station_type_unread_unique")
      .on(t.userId, t.ukeStationId, t.type)
      .where(sql`${t.readAt} IS NULL AND ${t.ukeStationId} IS NOT NULL`),
    index("notifications_station_watch_push_queue_idx")
      .on(t.pushQueuedAt)
      .where(sql`${t.pushQueuedAt} IS NOT NULL AND ${t.pushSentAt} IS NULL`),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    preferences: jsonb("preferences")
      .$type<{ ukeUpdates?: boolean; submissionUpdates?: boolean; newSubmission?: boolean; stationWatches?: boolean }>()
      .notNull()
      .default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_id_idx").on(t.userId)],
);

export const locationPhotos = pgTable(
  "location_photos",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    location_id: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    attachment_id: integer("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "cascade" }),
    submission_id: uuid("submission_id"),
    uploaded_by: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    note: varchar("note", { length: 100 }),
    taken_at: timestamp("taken_at", { withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("location_photos_location_id_idx").on(t.location_id),
    unique("location_photos_location_attachment_unique").on(t.location_id, t.attachment_id),
  ],
);

export const stationPhotoSelections = pgTable(
  "station_photo_selections",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    station_id: integer("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    location_photo_id: integer("location_photo_id")
      .notNull()
      .references(() => locationPhotos.id, { onDelete: "cascade" }),
    is_main: boolean("is_main").notNull().default(false),
  },
  (t) => [
    index("station_photo_selections_station_id_idx").on(t.station_id),
    unique("station_photo_selections_unique").on(t.station_id, t.location_photo_id),
  ],
);
