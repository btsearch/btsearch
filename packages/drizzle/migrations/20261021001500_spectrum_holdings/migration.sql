CREATE UNIQUE INDEX "sites_source_site_operator_unique" ON "official"."sites" ("source_id","site_id","operator_id") WHERE "source_ref" IS NULL;
CREATE TABLE "spectrum_holdings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "spectrum_holdings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"operator_id" integer NOT NULL,
	"band_id" integer NOT NULL,
	"region_id" integer,
	"dl_low_khz" integer NOT NULL,
	"dl_high_khz" integer NOT NULL,
	"ul_low_khz" integer,
	"ul_high_khz" integer,
	"valid_from" date,
	"valid_to" date,
	"source" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spectrum_holdings_downlink_order" CHECK ("dl_low_khz" < "dl_high_khz"),
	CONSTRAINT "spectrum_holdings_uplink_complete" CHECK (num_nulls("ul_low_khz", "ul_high_khz") IN (0, 2)),
	CONSTRAINT "spectrum_holdings_uplink_order" CHECK ("ul_low_khz" < "ul_high_khz"),
	CONSTRAINT "spectrum_holdings_validity_order" CHECK ("valid_from" <= "valid_to"),
	CONSTRAINT "spectrum_holdings_source_not_blank" CHECK (btrim("source") <> '')
);
--> statement-breakpoint
CREATE INDEX "spectrum_holdings_operator_id_idx" ON "spectrum_holdings" ("operator_id");--> statement-breakpoint
CREATE INDEX "spectrum_holdings_band_id_idx" ON "spectrum_holdings" ("band_id");--> statement-breakpoint
CREATE INDEX "spectrum_holdings_region_id_idx" ON "spectrum_holdings" ("region_id");--> statement-breakpoint
ALTER TABLE "spectrum_holdings" ADD CONSTRAINT "spectrum_holdings_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "spectrum_holdings" ADD CONSTRAINT "spectrum_holdings_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "spectrum_holdings" ADD CONSTRAINT "spectrum_holdings_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
