ALTER TABLE "cells" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "cell_type";--> statement-breakpoint
CREATE TYPE "cell_type" AS ENUM('MACROCELL', 'MICROCELL', 'PICOCELL', 'FEMTOCELL');--> statement-breakpoint
ALTER TABLE "cells" ALTER COLUMN "type" SET DATA TYPE "cell_type" USING "type"::"cell_type";--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ALTER COLUMN "type" SET DATA TYPE "cell_type" USING "type"::"cell_type";