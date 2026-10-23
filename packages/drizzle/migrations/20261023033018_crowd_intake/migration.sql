CREATE SCHEMA "observations";
--> statement-breakpoint
CREATE TYPE "country_tool" AS ENUM('analyzer', 'measurements');--> statement-breakpoint
CREATE TYPE "attestation_revocation_status" AS ENUM('revoked', 'suspended');--> statement-breakpoint
CREATE TYPE "attestation_security_level" AS ENUM('software', 'trustedEnvironment', 'strongBox');--> statement-breakpoint
CREATE TYPE "modem_family" AS ENUM('qualcomm', 'samsung', 'mediatek', 'unisoc', 'hisilicon', 'other');--> statement-breakpoint
CREATE TYPE "raw_store" AS ENUM('disk', 's3');--> statement-breakpoint
CREATE TYPE "upload_encoding" AS ENUM('zstd', 'gzip');--> statement-breakpoint
CREATE TYPE "upload_status" AS ENUM('received', 'processing', 'processed', 'rejected', 'withdrawn', 'excluded');--> statement-breakpoint
CREATE TYPE "verified_boot_state" AS ENUM('verified', 'selfSigned', 'unverified', 'failed');--> statement-breakpoint
CREATE TABLE "observations"."app_signing_keys" (
	"digest" bytea PRIMARY KEY,
	"package" varchar(255) NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "observations"."attestation_revocations" (
	"serial" bytea PRIMARY KEY,
	"status" "attestation_revocation_status" NOT NULL,
	"reason" varchar(64),
	"listed_on" date DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."boot_key_lists" (
	"os" varchar(32) PRIMARY KEY,
	"list_timestamp" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."contributor_blocks" (
	"user_id" uuid PRIMARY KEY,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_by_id" uuid,
	"reason" varchar(500) NOT NULL,
	"until" timestamp with time zone,
	CONSTRAINT "contributor_blocks_until_after_start" CHECK ("until" > "blocked_at")
);
--> statement-breakpoint
CREATE TABLE "observations"."contributors" (
	"user_id" uuid PRIMARY KEY,
	"is_listed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."crowd_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1,
	"raw_retention_days" integer DEFAULT 365 NOT NULL,
	"raw_storage_budget_gb" integer DEFAULT 100 NOT NULL,
	"min_app_version_code" integer DEFAULT 1 NOT NULL,
	"terms_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid,
	CONSTRAINT "crowd_settings_single_row" CHECK ("id" = 1),
	CONSTRAINT "crowd_settings_raw_retention_days_positive" CHECK ("raw_retention_days" > 0),
	CONSTRAINT "crowd_settings_raw_storage_budget_gb_positive" CHECK ("raw_storage_budget_gb" > 0),
	CONSTRAINT "crowd_settings_min_app_version_code_positive" CHECK ("min_app_version_code" > 0),
	CONSTRAINT "crowd_settings_terms_version_positive" CHECK ("terms_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."device_attestations" (
	"device_id" uuid PRIMARY KEY,
	"root" varchar(32) NOT NULL,
	"security_level" "attestation_security_level" NOT NULL,
	"keymint_security_level" "attestation_security_level" NOT NULL,
	"verified_boot_state" "verified_boot_state",
	"is_bootloader_locked" boolean,
	"verified_boot_key" bytea,
	"os_version" integer,
	"os_patch_level" integer,
	"vendor_patch_level" integer,
	"boot_patch_level" integer,
	"attested_package" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "observations"."device_attested_signatures" (
	"device_id" uuid,
	"digest" bytea,
	CONSTRAINT "device_attested_signatures_pkey" PRIMARY KEY("device_id","digest")
);
--> statement-breakpoint
CREATE TABLE "observations"."device_certificates" (
	"device_id" uuid,
	"position" smallint,
	"serial" bytea NOT NULL,
	"der" bytea NOT NULL,
	CONSTRAINT "device_certificates_pkey" PRIMARY KEY("device_id","position"),
	CONSTRAINT "device_certificates_position_nonnegative" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."device_models" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."device_models_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"manufacturer" varchar(64) NOT NULL,
	"model" varchar(64) NOT NULL,
	"board" varchar(64),
	"soc_id" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_models_manufacturer_model_soc_unique" UNIQUE NULLS NOT DISTINCT("manufacturer","model","soc_id")
);
--> statement-breakpoint
CREATE TABLE "observations"."device_revocations" (
	"device_id" uuid PRIMARY KEY,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by_id" uuid,
	"reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "observations"."devices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid,
	"model_id" integer NOT NULL,
	"public_key" bytea NOT NULL CONSTRAINT "devices_public_key_unique" UNIQUE,
	"phone_hmac" bytea,
	"label" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_label_not_blank" CHECK (btrim("label") <> '')
);
--> statement-breakpoint
CREATE TABLE "observations"."known_boot_keys" (
	"verified_boot_key" bytea PRIMARY KEY,
	"os" varchar(32) NOT NULL,
	"device_name" varchar(64),
	"added_on" date DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."socs" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."socs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"manufacturer" varchar(64) NOT NULL,
	"model" varchar(64) NOT NULL,
	"modem_family" "modem_family" DEFAULT 'other'::"modem_family" NOT NULL,
	CONSTRAINT "socs_manufacturer_model_unique" UNIQUE("manufacturer","model")
);
--> statement-breakpoint
CREATE TABLE "observations"."terms_acceptances" (
	"user_id" uuid,
	"version" integer,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY("user_id","version"),
	CONSTRAINT "terms_acceptances_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."uploads" (
	"id" uuid PRIMARY KEY,
	"device_id" uuid NOT NULL,
	"encoding" "upload_encoding" NOT NULL,
	"seal_key_id" varchar(16) NOT NULL,
	"body_bytes" integer NOT NULL,
	"body_sha256" bytea NOT NULL,
	"store" "raw_store" NOT NULL,
	"app_version_code" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "upload_status" DEFAULT 'received'::"upload_status" NOT NULL,
	"status_reason" varchar(500),
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"object_deleted_at" timestamp with time zone,
	CONSTRAINT "uploads_body_bytes_positive" CHECK ("body_bytes" > 0),
	CONSTRAINT "uploads_body_sha256_length" CHECK (octet_length("body_sha256") = 32),
	CONSTRAINT "uploads_attempts_nonnegative" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "tools" "country_tool"[] DEFAULT '{analyzer,measurements}'::"country_tool"[] NOT NULL;--> statement-breakpoint
CREATE INDEX "device_certificates_serial_idx" ON "observations"."device_certificates" ("serial");--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "observations"."devices" ("user_id");--> statement-breakpoint
CREATE INDEX "uploads_device_id_received_at_idx" ON "observations"."uploads" ("device_id","received_at");--> statement-breakpoint
CREATE INDEX "uploads_waiting_idx" ON "observations"."uploads" ("status","received_at") WHERE "status" IN ('received', 'processing');--> statement-breakpoint
CREATE INDEX "uploads_stored_idx" ON "observations"."uploads" ("received_at") WHERE "object_deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "observations"."contributor_blocks" ADD CONSTRAINT "contributor_blocks_user_id_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "observations"."contributors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."contributor_blocks" ADD CONSTRAINT "contributor_blocks_blocked_by_id_users_id_fkey" FOREIGN KEY ("blocked_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."contributors" ADD CONSTRAINT "contributors_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."crowd_settings" ADD CONSTRAINT "crowd_settings_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_attestations" ADD CONSTRAINT "device_attestations_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_attested_signatures" ADD CONSTRAINT "device_attested_signatures_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_certificates" ADD CONSTRAINT "device_certificates_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_models" ADD CONSTRAINT "device_models_soc_id_socs_id_fkey" FOREIGN KEY ("soc_id") REFERENCES "observations"."socs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_revocations" ADD CONSTRAINT "device_revocations_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_revocations" ADD CONSTRAINT "device_revocations_revoked_by_id_users_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."devices" ADD CONSTRAINT "devices_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."devices" ADD CONSTRAINT "devices_model_id_device_models_id_fkey" FOREIGN KEY ("model_id") REFERENCES "observations"."device_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "observations"."contributors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."uploads" ADD CONSTRAINT "uploads_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE VIEW "observations"."device_tiers" AS (
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
);--> statement-breakpoint
INSERT INTO "observations"."crowd_settings" ("id") VALUES (1);--> statement-breakpoint
DO $$
DECLARE
	problems text[] := '{}';
	counted bigint;
BEGIN
	SELECT count(*) INTO counted FROM "observations"."crowd_settings";
	IF counted <> 1 THEN problems := problems || format('observations.crowd_settings: %s rows, expected 1', counted); END IF;

	SELECT count(*) INTO counted FROM pg_tables WHERE schemaname = 'observations';
	IF counted <> 16 THEN problems := problems || format('observations: %s tables, expected 16', counted); END IF;

	IF to_regclass('observations.device_tiers') IS NULL THEN problems := problems || 'observations.device_tiers is missing'::text; END IF;

	IF cardinality(problems) > 0 THEN RAISE EXCEPTION 'crowd_intake: %', array_to_string(problems, '; '); END IF;
END $$;
