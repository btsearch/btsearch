CREATE TABLE "statistics"."microwave_link_snapshot_counts" (
	"snapshot_id" integer NOT NULL,
	"licensee_id" integer,
	"dimension" varchar(32) NOT NULL,
	"bucket" varchar(100),
	"links_count" integer NOT NULL,
	"length_sum_m" bigint NOT NULL,
	CONSTRAINT "microwave_link_snapshot_counts_group_unique" UNIQUE NULLS NOT DISTINCT("snapshot_id","licensee_id","dimension","bucket")
);
--> statement-breakpoint
CREATE TABLE "statistics"."microwave_link_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "statistics"."microwave_link_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_id" integer NOT NULL,
	"starts_on" date NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"specs_date" timestamp with time zone,
	CONSTRAINT "microwave_link_snapshots_source_starts_on_unique" UNIQUE("source_id","starts_on"),
	CONSTRAINT "microwave_link_snapshots_starts_on_month_start" CHECK (extract(day from "starts_on") = 1)
);
--> statement-breakpoint
CREATE INDEX "microwave_link_snapshot_counts_licensee_id_idx" ON "statistics"."microwave_link_snapshot_counts" ("licensee_id");--> statement-breakpoint
ALTER TABLE "statistics"."microwave_link_snapshot_counts" ADD CONSTRAINT "microwave_link_snapshot_counts_snapshot_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "statistics"."microwave_link_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "statistics"."microwave_link_snapshot_counts" ADD CONSTRAINT "microwave_link_snapshot_counts_licensee_id_licensees_id_fkey" FOREIGN KEY ("licensee_id") REFERENCES "official"."licensees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "statistics"."microwave_link_snapshots" ADD CONSTRAINT "microwave_link_snapshots_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "official"."sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;