ALTER TABLE "official"."microwave_links" RENAME COLUMN "freq" TO "freq_khz";--> statement-breakpoint
UPDATE "official"."microwave_links" SET "freq_khz" = "freq_khz" * 1000;--> statement-breakpoint
ALTER INDEX "official"."microwave_links_freq_idx" RENAME TO "microwave_links_freq_khz_idx";--> statement-breakpoint
ALTER TABLE "official"."microwave_links" ALTER COLUMN "tx_height" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."microwave_links" ALTER COLUMN "rx_height" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."microwave_links" ALTER COLUMN "decision_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."microwave_links" ALTER COLUMN "expiry_date" DROP NOT NULL;