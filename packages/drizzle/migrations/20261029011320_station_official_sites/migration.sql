ALTER TYPE "official_change" ADD VALUE 'permit_moved_in' BEFORE 'station_linked';--> statement-breakpoint
ALTER TYPE "official_change" ADD VALUE 'permit_moved_out' BEFORE 'station_linked';--> statement-breakpoint
CREATE TABLE "stations_official_sites" (
	"station_id" integer PRIMARY KEY,
	"official_site_id" integer NOT NULL CONSTRAINT "stations_official_sites_site_unique" UNIQUE
);
--> statement-breakpoint
ALTER TABLE "stations_official_sites" ADD CONSTRAINT "stations_official_sites_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stations_official_sites" ADD CONSTRAINT "stations_official_sites_official_site_id_sites_id_fkey" FOREIGN KEY ("official_site_id") REFERENCES "official"."sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
INSERT INTO "stations_official_sites" ("station_id", "official_site_id")
SELECT DISTINCT ON (link.station_id) link.station_id, permit.official_site_id
FROM "stations_permits" AS link
JOIN "official"."permits" AS permit ON permit.id = link.permit_id
ORDER BY link.station_id, permit.official_site_id
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP TABLE "stations_permits";--> statement-breakpoint
ALTER TABLE "official"."import_changes" DROP CONSTRAINT "import_changes_official_site_id_by_kind", DROP CONSTRAINT "import_changes_permit_id_by_kind";--> statement-breakpoint
UPDATE "official"."import_changes" AS change
SET "official_site_id" = resolved.official_site_id, "permit_id" = NULL
FROM (
	SELECT linked.run_id, linked.seq, COALESCE(permit.official_site_id, archived.official_site_id) AS official_site_id
	FROM "official"."import_changes" AS linked
	LEFT JOIN "official"."permits" AS permit ON permit.id = linked.permit_id
	LEFT JOIN (
		SELECT DISTINCT ON (run_id, permit_id) run_id, permit_id, official_site_id
		FROM "official"."import_changes"
		WHERE kind = 'permit_archived'
		ORDER BY run_id, permit_id, seq
	) AS archived ON archived.run_id = linked.run_id AND archived.permit_id = linked.permit_id
	WHERE linked.kind IN ('station_linked', 'station_unlinked')
) AS resolved
WHERE change.run_id = resolved.run_id AND change.seq = resolved.seq;--> statement-breakpoint
DELETE FROM "official"."import_changes" WHERE "kind" IN ('station_linked', 'station_unlinked') AND "official_site_id" IS NULL;--> statement-breakpoint
ALTER TABLE "official"."import_changes" ADD CONSTRAINT "import_changes_official_site_id_by_kind" CHECK (("official_site_id" IS NULL) = ("kind" IN ('microwave_link_added', 'microwave_link_renewed', 'microwave_link_archived')));--> statement-breakpoint
ALTER TABLE "official"."import_changes" ADD CONSTRAINT "import_changes_permit_id_by_kind" CHECK (("permit_id" IS NULL) = ("kind" IN ('site_added', 'site_moved', 'site_remapped', 'station_linked', 'station_unlinked', 'microwave_link_added', 'microwave_link_renewed', 'microwave_link_archived')));--> statement-breakpoint
ALTER TYPE "proposed_station_field" ADD VALUE 'ran_host_station_id';--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "ran_host_station_id" integer;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD COLUMN "ran_host_station_id" integer;--> statement-breakpoint
CREATE INDEX "stations_ran_host_station_id_idx" ON "stations" ("ran_host_station_id");--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_ran_host_station_id_stations_id_fkey" FOREIGN KEY ("ran_host_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_ran_host_not_self" CHECK ("ran_host_station_id" <> "id");
