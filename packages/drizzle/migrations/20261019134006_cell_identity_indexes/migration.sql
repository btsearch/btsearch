ALTER TABLE "gsm_cells" DROP CONSTRAINT "gsm_cells_lac_cid_unique";--> statement-breakpoint
ALTER TABLE "lte_cells" DROP CONSTRAINT "lte_cells_enbid_clid_unique";--> statement-breakpoint
ALTER TABLE "umts_cells" DROP CONSTRAINT "umts_cells_rnc_cid_unique";--> statement-breakpoint
CREATE INDEX "lte_cells_enbid_clid_idx" ON "lte_cells" ("enbid","clid");--> statement-breakpoint
CREATE INDEX "nr_cells_nci_idx" ON "nr_cells" ("nci");--> statement-breakpoint
CREATE INDEX "notifications_official_site_id_idx" ON "notifications" ("official_site_id") WHERE "official_site_id" IS NOT NULL;
ALTER TYPE "uplink_type" ADD VALUE 'xdsl';
