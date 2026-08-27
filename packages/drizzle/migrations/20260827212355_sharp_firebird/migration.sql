CREATE TYPE "cell_type" AS ENUM('MACROCELL', 'MICROCELL', 'PICOCELL', 'FEMTOCELL', 'SMALLCELL');--> statement-breakpoint
ALTER TABLE "cells" ADD COLUMN "type" "cell_type";--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD COLUMN "type" "cell_type";