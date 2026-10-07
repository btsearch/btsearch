ALTER TABLE "countries" ADD COLUMN "structure_owner_proposals" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "psc" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "bsic" boolean DEFAULT false NOT NULL;