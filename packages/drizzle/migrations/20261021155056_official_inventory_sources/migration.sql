CREATE TYPE "official_permit_kind" AS ENUM('permit', 'registration', 'inventory', 'environmental_permit', 'certificate', 'assessment', 'licence');--> statement-breakpoint
DROP INDEX IF EXISTS "official"."sites_site_operator_location_unique";--> statement-breakpoint
ALTER TABLE "official"."datasets" ADD COLUMN "permit_kind" "official_permit_kind" NOT NULL DEFAULT 'permit';--> statement-breakpoint
UPDATE "official"."datasets" SET "permit_kind" = 'registration' WHERE "key" = 'device-registry' AND "source_id" = (SELECT "id" FROM "official"."sources" WHERE "key" = 'pl-uke');--> statement-breakpoint
ALTER TABLE "official"."datasets" ALTER COLUMN "permit_kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "official"."locations" ADD COLUMN "precision_meters" integer;--> statement-breakpoint
ALTER TABLE "official"."permits" ALTER COLUMN "decision_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."permits" ALTER COLUMN "decision_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."permits" ALTER COLUMN "rat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."permits" ALTER COLUMN "label_mhz" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."permits" ALTER COLUMN "label_variant" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."sites" ALTER COLUMN "site_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."locations" ADD CONSTRAINT "locations_precision_positive" CHECK ("precision_meters" > 0);--> statement-breakpoint
ALTER TABLE "official"."permits" ADD CONSTRAINT "permits_label_shape" CHECK (num_nulls("label_mhz", "label_variant") IN (0, 2) AND ("label_mhz" IS NULL OR "rat" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "official"."sites" ADD CONSTRAINT "sites_site_id_or_source_ref" CHECK ("site_id" IS NOT NULL OR "source_ref" IS NOT NULL);