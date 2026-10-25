import {
  ATTESTATION_SECURITY_LEVELS,
  MEASUREMENT_MODEM_FAMILIES,
  MEASUREMENT_UPLOAD_STATUSES,
  VERIFIED_BOOT_STATES,
} from "@openbts/shared/contract/constants";
import {
  bigint,
  boolean,
  bytea,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgSchema,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm/sql";

import { users } from "./auth.ts";

export const ObservationsSchema = pgSchema("observations");

export const ModemFamily = pgEnum("modem_family", MEASUREMENT_MODEM_FAMILIES);
export const AttestationSecurityLevel = pgEnum("attestation_security_level", ATTESTATION_SECURITY_LEVELS);
export const VerifiedBootState = pgEnum("verified_boot_state", VERIFIED_BOOT_STATES);
export const AttestationRevocationStatus = pgEnum("attestation_revocation_status", ["revoked", "suspended"]);
export const UploadEncoding = pgEnum("upload_encoding", ["zstd", "gzip"]);
export const RawStore = pgEnum("raw_store", ["disk", "s3"]);
export const UploadStatus = pgEnum("upload_status", MEASUREMENT_UPLOAD_STATUSES);

export const socs = ObservationsSchema.table(
  "socs",
  {
    id: smallint("id").generatedAlwaysAsIdentity().primaryKey(),
    manufacturer: varchar("manufacturer", { length: 64 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    modemFamily: ModemFamily("modem_family").notNull().default("other"),
  },
  (t) => [unique("socs_manufacturer_model_unique").on(t.manufacturer, t.model)],
);

export const deviceModels = ObservationsSchema.table(
  "device_models",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    manufacturer: varchar("manufacturer", { length: 64 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    board: varchar("board", { length: 64 }),
    socId: smallint("soc_id").references(() => socs.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("device_models_manufacturer_model_soc_unique").on(t.manufacturer, t.model, t.socId).nullsNotDistinct()],
);

export const boardSocs = ObservationsSchema.table("board_socs", {
  board: varchar("board", { length: 64 }).primaryKey(),
  socId: smallint("soc_id")
    .notNull()
    .references(() => socs.id, { onDelete: "restrict", onUpdate: "cascade" }),
});

export const devices = ObservationsSchema.table(
  "devices",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    modelId: integer("model_id")
      .notNull()
      .references(() => deviceModels.id, { onDelete: "restrict", onUpdate: "cascade" }),
    publicKey: bytea("public_key").notNull().unique("devices_public_key_unique"),
    phoneHmac: bytea("phone_hmac"),
    label: varchar("label", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("devices_user_id_idx").on(t.userId),
    index("devices_phone_hmac_idx").on(t.phoneHmac),
    check("devices_label_not_blank", sql`btrim(${t.label}) <> ''`),
  ],
);

export const deviceAttestations = ObservationsSchema.table("device_attestations", {
  deviceId: uuid("device_id")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade", onUpdate: "cascade" }),
  root: varchar("root", { length: 32 }).notNull(),
  securityLevel: AttestationSecurityLevel("security_level").notNull(),
  keymintSecurityLevel: AttestationSecurityLevel("keymint_security_level").notNull(),
  verifiedBootState: VerifiedBootState("verified_boot_state"),
  isBootloaderLocked: boolean("is_bootloader_locked"),
  verifiedBootKey: bytea("verified_boot_key"),
  osVersion: integer("os_version"),
  osPatchLevel: integer("os_patch_level"),
  vendorPatchLevel: integer("vendor_patch_level"),
  bootPatchLevel: integer("boot_patch_level"),
  attestedPackage: varchar("attested_package", { length: 255 }),
});

export const deviceAttestedSignatures = ObservationsSchema.table(
  "device_attested_signatures",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade", onUpdate: "cascade" }),
    digest: bytea("digest").notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.digest] })],
);

export const deviceCertificates = ObservationsSchema.table(
  "device_certificates",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade", onUpdate: "cascade" }),
    position: smallint("position").notNull(),
    serial: bytea("serial").notNull(),
    der: bytea("der").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.position] }),
    index("device_certificates_serial_idx").on(t.serial),
    check("device_certificates_position_nonnegative", sql`${t.position} >= 0`),
  ],
);

export const appSigningKeys = ObservationsSchema.table("app_signing_keys", {
  digest: bytea("digest").primaryKey(),
  package: varchar("package", { length: 255 }).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  note: varchar("note", { length: 500 }),
});

export const attestationRevocations = ObservationsSchema.table("attestation_revocations", {
  serial: bytea("serial").primaryKey(),
  status: AttestationRevocationStatus("status").notNull(),
  reason: varchar("reason", { length: 64 }),
  listedOn: date("listed_on").notNull().defaultNow(),
});

export const knownBootKeys = ObservationsSchema.table("known_boot_keys", {
  verifiedBootKey: bytea("verified_boot_key").primaryKey(),
  os: varchar("os", { length: 32 }).notNull(),
  deviceName: varchar("device_name", { length: 64 }),
  addedOn: date("added_on").notNull().defaultNow(),
});

export const bootKeyLists = ObservationsSchema.table("boot_key_lists", {
  os: varchar("os", { length: 32 }).primaryKey(),
  listTimestamp: bigint("list_timestamp", { mode: "number" }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

export const deviceRevocations = ObservationsSchema.table("device_revocations", {
  deviceId: uuid("device_id")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade", onUpdate: "cascade" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull().defaultNow(),
  revokedById: uuid("revoked_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  reason: varchar("reason", { length: 500 }),
});

export const deviceWeights = ObservationsSchema.table(
  "device_weights",
  {
    deviceId: uuid("device_id")
      .primaryKey()
      .references(() => devices.id, { onDelete: "cascade", onUpdate: "cascade" }),
    weight: real("weight").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    setById: uuid("set_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("device_weights_weight_range", sql`${t.weight} BETWEEN 0 AND 2`)],
);

export const contributors = ObservationsSchema.table("contributors", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  listedAt: timestamp("listed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const termsAcceptances = ObservationsSchema.table(
  "terms_acceptances",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => contributors.userId, { onDelete: "cascade", onUpdate: "cascade" }),
    version: integer("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.version] }), check("terms_acceptances_version_positive", sql`${t.version} > 0`)],
);

export const contributorBlocks = ObservationsSchema.table(
  "contributor_blocks",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => contributors.userId, { onDelete: "cascade", onUpdate: "cascade" }),
    blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
    blockedById: uuid("blocked_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    reason: varchar("reason", { length: 500 }).notNull(),
    until: timestamp("until", { withTimezone: true }),
  },
  (t) => [check("contributor_blocks_until_after_start", sql`${t.until} > ${t.blockedAt}`)],
);

export const vouches = ObservationsSchema.table(
  "vouches",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => contributors.userId, { onDelete: "cascade", onUpdate: "cascade" }),
    weight: real("weight").notNull(),
    confirmsAlone: boolean("confirms_alone").notNull().default(false),
    reason: varchar("reason", { length: 500 }).notNull(),
    vouchedById: uuid("vouched_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    vouchedAt: timestamp("vouched_at", { withTimezone: true }).notNull().defaultNow(),
    until: timestamp("until", { withTimezone: true }),
  },
  (t) => [check("vouches_weight_range", sql`${t.weight} BETWEEN 0 AND 2`), check("vouches_until_after_start", sql`${t.until} > ${t.vouchedAt}`)],
);

export const uploads = ObservationsSchema.table(
  "uploads",
  {
    id: uuid("id").primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict", onUpdate: "cascade" }),
    encoding: UploadEncoding("encoding").notNull(),
    sealKeyId: varchar("seal_key_id", { length: 16 }).notNull(),
    bodyBytes: integer("body_bytes").notNull(),
    bodySha256: bytea("body_sha256").notNull(),
    store: RawStore("store").notNull(),
    appVersionCode: integer("app_version_code").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    status: UploadStatus("status").notNull().default("received"),
    statusReason: varchar("status_reason", { length: 500 }),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    excludedById: uuid("excluded_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    attempts: smallint("attempts").notNull().default(0),
    lastError: text("last_error"),
    objectDeletedAt: timestamp("object_deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("uploads_device_id_received_at_idx").on(t.deviceId, t.receivedAt),
    index("uploads_waiting_idx")
      .on(t.status, t.receivedAt)
      .where(sql`${t.status} IN ('received', 'processing')`),
    index("uploads_stored_idx")
      .on(t.receivedAt)
      .where(sql`${t.objectDeletedAt} IS NULL`),
    index("uploads_subtractable_idx")
      .on(t.statusChangedAt)
      .where(sql`${t.status} IN ('withdrawn', 'excluded') AND ${t.objectDeletedAt} IS NULL`),
    check("uploads_body_bytes_positive", sql`${t.bodyBytes} > 0`),
    check("uploads_body_sha256_length", sql`octet_length(${t.bodySha256}) = 32`),
    check("uploads_attempts_nonnegative", sql`${t.attempts} >= 0`),
  ],
);

export const crowdSettings = ObservationsSchema.table(
  "crowd_settings",
  {
    id: smallint("id").primaryKey().default(1),
    rawRetentionDays: integer("raw_retention_days").notNull().default(365),
    rawStorageBudgetGb: integer("raw_storage_budget_gb").notNull().default(100),
    minAppVersionCode: integer("min_app_version_code").notNull().default(1),
    termsVersion: integer("terms_version").notNull().default(1),
    publishedAlgorithmVersion: smallint("published_algorithm_version").notNull().default(1),
    publicRadiusMaxM: integer("public_radius_max_m").notNull().default(1000),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  },
  (t) => [
    check("crowd_settings_single_row", sql`${t.id} = 1`),
    check("crowd_settings_raw_retention_days_positive", sql`${t.rawRetentionDays} > 0`),
    check("crowd_settings_raw_storage_budget_gb_positive", sql`${t.rawStorageBudgetGb} > 0`),
    check("crowd_settings_min_app_version_code_positive", sql`${t.minAppVersionCode} > 0`),
    check("crowd_settings_terms_version_positive", sql`${t.termsVersion} > 0`),
    check("crowd_settings_published_algorithm_version_positive", sql`${t.publishedAlgorithmVersion} > 0`),
    check("crowd_settings_public_radius_max_m_positive", sql`${t.publicRadiusMaxM} > 0`),
  ],
);

export const deviceTiers = ObservationsSchema.view("device_tiers", {
  deviceId: uuid("device_id").notNull(),
  tier: text("tier").$type<"strong" | "hardware" | "software" | "none">().notNull(),
}).as(sql`
  SELECT d.id AS device_id,
    CASE
      WHEN a.device_id IS NULL THEN 'none'
      WHEN a.security_level = 'software' OR a.root = 'unknown' OR EXISTS (
        SELECT 1 FROM observations.device_certificates c
        JOIN observations.attestation_revocations r ON r.serial = c.serial
        WHERE c.device_id = d.id
      ) THEN 'software'
      WHEN a.is_bootloader_locked IS NOT TRUE OR NOT coalesce(
        a.verified_boot_state = 'verified' OR (a.verified_boot_state = 'selfSigned' AND EXISTS (
          SELECT 1 FROM observations.known_boot_keys k WHERE k.verified_boot_key = a.verified_boot_key
        )),
        false
      ) THEN 'hardware'
      WHEN EXISTS (
        SELECT 1 FROM observations.device_attested_signatures s
        JOIN observations.app_signing_keys k ON k.digest = s.digest AND k.package = a.attested_package
        WHERE s.device_id = d.id
      ) THEN 'strong'
      ELSE 'software'
    END AS tier
  FROM observations.devices d
  LEFT JOIN observations.device_attestations a ON a.device_id = d.id
`);
