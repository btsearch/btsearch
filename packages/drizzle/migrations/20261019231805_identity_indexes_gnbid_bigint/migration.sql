ALTER TABLE "nr_cells" DROP COLUMN "nci";--> statement-breakpoint
ALTER TABLE "nr_cells" ALTER COLUMN "gnbid" SET DATA TYPE bigint USING "gnbid"::bigint;--> statement-breakpoint
ALTER TABLE "nr_cells" ADD COLUMN "nci" bigint GENERATED ALWAYS AS (("nr_cells"."gnbid"::bigint * power(2, 36 - "nr_cells"."gnbid_length")::bigint) + "nr_cells"."clid"::bigint) STORED;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_nr_cells" ALTER COLUMN "gnbid" SET DATA TYPE bigint USING "gnbid"::bigint;--> statement-breakpoint
CREATE INDEX "nr_cells_nci_idx" ON "nr_cells" ("nci");--> statement-breakpoint
CREATE INDEX "nr_cells_nci_trgm_idx" ON "nr_cells" USING gin (("nci"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "gsm_cells_lac_cid_idx" ON "gsm_cells" ("lac","cid");--> statement-breakpoint
CREATE INDEX "umts_cells_rnc_cid_idx" ON "umts_cells" ("rnc","cid");--> statement-breakpoint
CREATE INDEX "nr_cells_gnbid_clid_idx" ON "nr_cells" ("gnbid","clid");
