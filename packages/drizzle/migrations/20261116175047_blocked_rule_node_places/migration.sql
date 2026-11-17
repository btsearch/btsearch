ALTER TYPE "sample_drop_reason" ADD VALUE 'blockedRule' BEFORE 'noLevel';--> statement-breakpoint
CREATE TABLE "observations"."site_splits" (
	"observed_site_id" integer,
	"observed_cell_id" integer,
	"part" smallint NOT NULL,
	CONSTRAINT "site_splits_pkey" PRIMARY KEY("observed_site_id","observed_cell_id"),
	CONSTRAINT "site_splits_part_nonnegative" CHECK ("part" >= 0)
);
--> statement-breakpoint
ALTER TABLE "observations"."observed_sites" ADD COLUMN "place" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP INDEX "observations"."observed_sites_identity_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "observed_sites_identity_unique" ON "observations"."observed_sites" ("plmn","rat","node_id","place") WHERE "retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "observed_sites_retired_at_idx" ON "observations"."observed_sites" ("retired_at") WHERE "retired_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "observed_sites_node_places_idx" ON "observations"."observed_sites" ("plmn","rat","node_id","place") WHERE "place" > 0;--> statement-breakpoint
CREATE INDEX "site_splits_observed_cell_id_idx" ON "observations"."site_splits" ("observed_cell_id");--> statement-breakpoint
ALTER TABLE "observations"."site_splits" ADD CONSTRAINT "site_splits_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_splits" ADD CONSTRAINT "site_splits_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observed_sites" ADD CONSTRAINT "observed_sites_place_of_node" CHECK ("place" >= 0 AND ("place" = 0 OR ("rat" IN ('LTE', 'NR') AND "node_id" IS NOT NULL)));