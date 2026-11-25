ALTER TABLE "observations"."upload_drops" ALTER COLUMN "reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "sample_drop_reason";--> statement-breakpoint
CREATE TYPE "sample_drop_reason" AS ENUM('mockLocation', 'poorAccuracy', 'implausibleFix', 'noPosition', 'badTime', 'tooOld', 'duplicate', 'implausible', 'closedCountry', 'readingBlock', 'noLevel', 'noIdentity');--> statement-breakpoint
ALTER TABLE "observations"."upload_drops" ALTER COLUMN "reason" SET DATA TYPE "sample_drop_reason" USING "reason"::"sample_drop_reason";