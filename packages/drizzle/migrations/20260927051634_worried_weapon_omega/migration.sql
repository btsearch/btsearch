ALTER TABLE "attachments" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "has_thumb" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "has_full" boolean DEFAULT false NOT NULL;