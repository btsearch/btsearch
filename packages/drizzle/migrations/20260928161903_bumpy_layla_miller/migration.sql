CREATE TYPE "sector_operation" AS ENUM('add', 'update', 'delete');--> statement-breakpoint
ALTER TABLE "submissions"."proposed_sectors" ADD COLUMN "operation" "sector_operation";