CREATE TYPE "proposed_location_field" AS ENUM('region_id', 'city', 'address', 'longitude', 'latitude');--> statement-breakpoint
CREATE TYPE "proposed_station_field" AS ENUM('station_id', 'operator_id', 'notes', 'networks_id', 'networks_name', 'mno_name', 'uplink_type', 'uplink_speed', 'uplink_model');--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD COLUMN "changed_fields" "proposed_location_field"[];--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD COLUMN "changed_fields" "proposed_station_field"[];--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ALTER COLUMN "region_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ALTER COLUMN "longitude" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ALTER COLUMN "latitude" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ALTER COLUMN "operator_id" DROP NOT NULL;