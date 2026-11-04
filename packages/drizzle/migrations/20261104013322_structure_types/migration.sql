ALTER TABLE "locations" ALTER COLUMN "structure_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ALTER COLUMN "structure_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "structure_type";--> statement-breakpoint
CREATE TYPE "structure_type" AS ENUM('lattice_tower', 'tubular_tower', 'concrete_tower', 'tower', 'mast', 'rooftop_mast', 'rooftop', 'building_tower', 'facade', 'chimney', 'church', 'water_tower', 'floodlight_tower', 'silo', 'pole', 'advertising_pylon', 'relocatable_mast', 'mobile_mast', 'tunnel', 'indoor');--> statement-breakpoint
ALTER TABLE "locations" ALTER COLUMN "structure_type" SET DATA TYPE "structure_type" USING NULLIF("structure_type", 'other')::"structure_type";--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ALTER COLUMN "structure_type" SET DATA TYPE "structure_type" USING NULLIF("structure_type", 'other')::"structure_type";--> statement-breakpoint
CREATE INDEX "locations_structure_note_fold_trgm_idx" ON "locations" USING gin (fold_text("structure_note") gin_trgm_ops);