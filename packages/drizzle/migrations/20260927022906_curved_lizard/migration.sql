CREATE TYPE "uplink_type" AS ENUM('fiber', 'microwave');--> statement-breakpoint
CREATE TABLE "station_uplinks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "station_uplinks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" integer NOT NULL CONSTRAINT "station_uplinks_station_id_unique" UNIQUE,
	"type" "uplink_type" NOT NULL,
	"speed" integer,
	"model" varchar(100)
);
--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD COLUMN "uplink_type" "uplink_type";--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD COLUMN "uplink_speed" integer;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD COLUMN "uplink_model" varchar(100);--> statement-breakpoint
ALTER TABLE "station_uplinks" ADD CONSTRAINT "station_uplinks_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;