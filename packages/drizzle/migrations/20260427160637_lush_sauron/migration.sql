ALTER TABLE "stats_snapshots" ALTER COLUMN "band_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stats_snapshots" ALTER COLUMN "permits_count" SET DEFAULT 0;--> statement-breakpoint
CREATE UNIQUE INDEX "stats_snapshots_date_operator_null_band_unique" ON "stats_snapshots" ("snapshot_date","operator_id") WHERE "band_id" IS NULL;